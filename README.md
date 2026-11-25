
# Together Server – Community Event Management API

Together Server is the backend API for **Together**, a community-driven social development platform that connects people through meaningful events and volunteer activities.

The server provides RESTful APIs for managing community events, handling event registrations, and securely managing user-owned activities. It uses MongoDB to store event and registration data and verifies authentication tokens to protect sensitive operations.

## 🌐 Project Links

- **Live Website:** [Together](https://together-frontend-lime.vercel.app/)

## ✨ Key Features

- **Event Management:** Create, update, retrieve, and delete community events.
- **Upcoming Events API:** Retrieve events for the Together platform.
- **Recent Events API:** Fetch the six nearest upcoming events.
- **Event Details:** Get detailed information about a specific event.
- **Event Registration:** Allow authenticated users to join community events.
- **Joined Events Tracking:** Retrieve and manage a user's registered events.
- **Event Ownership:** Restrict event updates and deletion to the event creator.
- **Secure Authentication:** Verify Better Auth JWT tokens using JSON Web Key Sets (JWKS).
- **Duplicate Registration Protection:** Prevent users from registering for the same event more than once.
- **Data Validation:** Validate event information and MongoDB ObjectIds before processing requests.
- **Registration Cleanup:** Automatically remove associated registrations when an event is deleted.
- **MongoDB Integration:** Store and manage event and registration data using MongoDB.

## 🛠️ Technologies Used

- Node.js
- Express.js
- MongoDB
- MongoDB Native Driver
- Better Auth JWT
- JOSE
- CORS
- dotenv

## 🎯 Project Purpose

Together Server supports the Together platform's mission of encouraging community participation and social responsibility.

By providing secure and organized event management APIs, it helps users create meaningful initiatives, participate in community activities, and contribute to positive social change.

---

**Together – Small Actions, Big Changes.**
