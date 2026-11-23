import express from "express";
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'

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

// http://localhost:8000/event/:id

app.post("/create-event", async (req, res) => {
    const data = req.body
    const result = await eventCollection.insertOne(data)
    res.send(result)
})

app.get('/upcoming-events', async (req, res) => {
    const result = await eventCollection.find().toArray()
    res.send(result)
})

app.get('/upcoming-event/:id', async (req, res) => {
    const { id } = req.params
    const result = await eventCollection.findOne({ _id: new ObjectId(id) })
    res.send(result)
})

app.post('/joined', async (req, res) => {
    const data = req.body
    const result = await joinedCollection.insertOne(data)
    res.send(result)
})

app.get('/joined-events/:email', async (req, res) => {
    const { email } = req.params
    const result = await joinedCollection.find({ email: email }).toArray()
    res.send(result)
})

app.delete('/joinedevents/:id', async (req, res) => {
    const { id } = req.params
    const result = await joinedCollection.deleteOne({ _id: new ObjectId(id) })
    res.send(result)
})

app.get('/manage-events/:email', async (req, res) => {
    const { email } = req.params
    const result = await eventCollection.find({ userEmail: email }).toArray()
    res.send(result)
})

app.patch('/event/:id', async (req, res) => {
    const { id } = req.params
    const updatedData = req.body
    const result = await eventCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
    )
    res.status(200).json(result)
})

app.delete('/event/:id', async (req, res) => {
    const {id} = req.params
    const result = await eventCollection.deleteOne({_id: new ObjectId(id)})
    res.json(result)
})

app.get("/", (req, res) => {
    res.send("Hello World from PH..");
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
