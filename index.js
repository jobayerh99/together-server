import express from "express";
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = 8000;
app.use(cors())
app.use(express.json())

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

const mongoClient = await connectToMongoDB()
const db = mongoClient.db("together")
const eventCollection = db.collection("event")
const joinedCollection = db.collection("joined")

// Backfill verified identity fields on registrations created before the join
// API stored userId/userEmail (old records used the raw Better Auth `id`/`email`).
try {
    await joinedCollection.updateMany(
        { userId: { $exists: false }, id: { $exists: true } },
        [{ $set: { userId: "$id", userEmail: "$email", userName: "$name", userImage: "$image" } }]
    )

    // One registration per user per event (spec: unique compound index).
    await joinedCollection.createIndex({ eventId: 1, userId: 1 }, { unique: true })
} catch (err) {
    console.error("Joined-collection index setup failed:", err?.message)
}

// http://localhost:8000/event/:id

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ msg: 'Unauthorized' })
        }

        const token = authHeader.slice("Bearer ".length).trim()

        if (!token) {
            return res.status(401).json({ msg: 'Unauthorized' })
        }

        if (!process.env.CLIENT_URL) {
            console.error("CLIENT_URL is not set — cannot build the JWKS URL.")
            return res.status(500).json({ msg: 'Server configuration error' })
        }

        // Better Auth serves its JWKS at <origin>/api/auth/jwks.
        const jwksUrl = new URL("/api/auth/jwks", process.env.CLIENT_URL)
        const JWKS = createRemoteJWKSet(jwksUrl)

        // Issuer/audience are only enforced when configured on both sides.
        const verifyOptions = process.env.JWT_ISSUER
            ? { issuer: process.env.JWT_ISSUER }
            : undefined

        const { payload } = await jwtVerify(token, JWKS, verifyOptions)

        // Attach the *verified* identity. Handlers must never trust
        // userEmail/userId coming from the request body instead of this.
        const userId = payload.sub ?? payload.id
        if (!userId) {
            return res.status(401).json({ msg: 'Token missing user identity' })
        }

        req.auth = {
            userId,
            email: payload.email,
            name: payload.name,
            image: payload.image ?? payload.picture ?? null,
        }

        next()
    } catch (error) {
        console.error("Token verification failed:", error?.message)
        return res.status(401).json({ msg: 'Token error' })
    }
}

app.post("/create-event", verifyToken, async (req, res) => {
    try {
        const data = req.body ?? {}

        // Backend validation (spec: validation on both frontend and backend).
        const missing = ["title", "description", "eventType", "thumbnailUrl", "location", "eventDate"]
            .filter((field) => typeof data[field] !== "string" || !data[field].trim())
        if (missing.length) {
            return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}.` })
        }

        if (Number.isNaN(new Date(data.eventDate).getTime())) {
            return res.status(400).json({ message: "Event date is invalid." })
        }

        // Owner identity always comes from the verified JWT, never the body.
        data.userId = req.auth.userId
        data.userEmail = req.auth.email
        data.userName = req.auth.name ?? data.userName
        data.userImage = req.auth.image ?? data.userImage ?? null
        data.createdAt = new Date()
        data.updatedAt = new Date()

        const result = await eventCollection.insertOne(data)
        res.status(201).send(result)
    } catch (error) {
        console.error("Create event error:", error?.message)
        res.status(500).json({ message: "Failed to create event." })
    }
})

app.get('/upcoming-events', async (req, res) => {
    const result = await eventCollection.find().toArray()
    res.send(result)
})

app.get('/recent-event', async (req, res) => {
    const today = new Date().toISOString();

    const result = await eventCollection
        .find({
            eventDate: { $gte: today }
        })
        .sort({ eventDate: 1 })
        .limit(6)
        .toArray();

    res.send(result);
});

// Event details are public (spec §14: visitors view details without auth).
app.get('/upcoming-event/:id', async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
        return res.status(404).json({ message: "Event not found." })
    }

    try {
        const result = await eventCollection.findOne({ _id: new ObjectId(id) })
        if (!result) {
            return res.status(404).json({ message: "Event not found." })
        }
        res.send(result)
    } catch (error) {
        console.error("Get event error:", error?.message)
        res.status(500).json({ message: "Failed to load event." })
    }
})

app.post('/joined', verifyToken, async (req, res) => {
    try {
        const { userId, email, name, image } = req.auth
        const { eventId } = req.body ?? {}

        if (typeof eventId !== "string" || !eventId.trim()) {
            return res.status(400).json({ message: "eventId is required." })
        }
        if (!ObjectId.isValid(eventId)) {
            return res.status(400).json({ message: "Invalid event id." })
        }

        const event = await eventCollection.findOne({ _id: new ObjectId(eventId) })
        if (!event) {
            return res.status(404).json({ message: "Event not found." })
        }

        const existing = await joinedCollection.findOne({ eventId, userId })
        if (existing) {
            return res.status(409).json({ message: "You have already joined this event." })
        }

        // Snapshot of the event for display + identity from the verified JWT.
        const doc = {
            eventId,
            userId,
            userEmail: email,
            userName: name,
            userImage: image ?? null,
            title: event.title,
            description: event.description,
            eventType: event.eventType,
            thumbnailUrl: event.thumbnailUrl,
            location: event.location,
            eventDate: event.eventDate,
            joinedAt: new Date(),
        }

        const result = await joinedCollection.insertOne(doc)
        res.status(201).send({ ...doc, _id: result.insertedId })
    } catch (error) {
        // Unique compound index on eventId + userId — race-safe duplicate guard.
        if (error?.code === 11000) {
            return res.status(409).json({ message: "You have already joined this event." })
        }
        console.error("Join event error:", error?.message)
        res.status(500).json({ message: "Failed to join event." })
    }
})

// New registrations store the verified identity as userEmail; older records
// used the raw Better Auth `email` field — match both. Users may only read
// their own registrations (identity comes from the verified JWT).
app.get('/joined-events/:email', verifyToken, async (req, res) => {
    const { email } = req.params

    if (req.auth.email !== email) {
        return res.status(403).json({ message: "You may only view your own joined events." })
    }

    const result = await joinedCollection
        .find({ $or: [{ userEmail: email }, { email }] })
        .toArray()
    res.send(result)
})

// Leaving an event: only the owner of a registration may delete it.
app.delete('/joinedevents/:id', verifyToken, async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
        return res.status(404).json({ message: "Registration not found." })
    }

    try {
        const result = await joinedCollection.deleteOne({
            _id: new ObjectId(id),
            userId: req.auth.userId,
        })

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Registration not found." })
        }

        res.send(result)
    } catch (error) {
        console.error("Leave event error:", error?.message)
        res.status(500).json({ message: "Failed to leave event." })
    }
})

// The authenticated user may only list their own events (spec §19: protected).
app.get('/manage-events/:email', verifyToken, async (req, res) => {
    const { email } = req.params

    if (req.auth.email !== email) {
        return res.status(403).json({ message: "You may only view your own events." })
    }

    const result = await eventCollection.find({ userEmail: email }).toArray()
    res.send(result)
})

app.patch('/event/:id', verifyToken, async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
        return res.status(404).json({ message: "Event not found." })
    }

    try {
        const event = await eventCollection.findOne({ _id: new ObjectId(id) })
        if (!event) {
            return res.status(404).json({ message: "Event not found." })
        }

        // Ownership: only the creator may update (never trust body identity).
        if (event.userEmail !== req.auth.email && event.userId !== req.auth.userId) {
            return res.status(403).json({ message: "You are not allowed to update this event." })
        }

        const updatedData = { ...(req.body ?? {}) }
        // Owner fields are immutable.
        delete updatedData._id
        delete updatedData.userId
        delete updatedData.userEmail
        delete updatedData.createdByEmail
        delete updatedData.createdByUserId
        delete updatedData.createdAt
        updatedData.updatedAt = new Date()

        const result = await eventCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedData }
        )
        res.status(200).json(result)
    } catch (error) {
        console.error("Update event error:", error?.message)
        res.status(500).json({ message: "Failed to update event." })
    }
})

app.delete('/event/:id', verifyToken, async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
        return res.status(404).json({ message: "Event not found." })
    }

    try {
        const event = await eventCollection.findOne({ _id: new ObjectId(id) })
        if (!event) {
            return res.status(404).json({ message: "Event not found." })
        }

        // Ownership: only the creator may delete (never trust body identity).
        if (event.userEmail !== req.auth.email && event.userId !== req.auth.userId) {
            return res.status(403).json({ message: "You are not allowed to delete this event." })
        }

        const result = await eventCollection.deleteOne({ _id: new ObjectId(id) })

        // Keep registrations consistent when an event disappears (spec §18).
        await joinedCollection.deleteMany({ eventId: id })

        res.json(result)
    } catch (error) {
        console.error("Delete event error:", error?.message)
        res.status(500).json({ message: "Failed to delete event." })
    }
})

app.get("/", (req, res) => {
    res.send("Hello World from PH..");
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});


export default app