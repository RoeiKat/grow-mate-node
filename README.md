# 🌱 GrowMate Node Server

The GrowMate Node Server is the backend powering the ARO G1 ecosystem.

It provides authentication, device pairing, telemetry management, command execution, and device ownership management through a REST API consumed by the GrowMate Web application and ARO G1 firmware.

---

# Features

- JWT Authentication
- User Registration & Login
- Device Pairing
- Device Ownership
- Telemetry Storage
- Remote Commands
- RESTful API
- MongoDB Database
- Secure Password Hashing
- CORS Protection
- Request Logging
- Rate Limiting
- Helmet Security

---

# Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JSON Web Tokens (JWT)
- bcrypt
- Helmet
- Morgan
- express-rate-limit
- dotenv

---

# Project Structure

```text
src/
│
├── config/             Configuration files
├── controllers/        Route controllers
├── middleware/         Authentication & error middleware
├── models/             MongoDB models
├── routes/             API routes
├── services/           Business logic
├── utils/              Helper functions
└── app.js
```

---


# Authentication

Authentication is performed using JSON Web Tokens (JWT).

Protected routes require the following header:

```http
Authorization: Bearer <token>
```

Passwords are securely hashed before being stored.

---

# API Routes

## Authentication

### Register

```http
POST /api/auth/register
```

Creates a new user account.

Request

```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

---

### Login

```http
POST /api/auth/login
```

Returns a JWT token after successful authentication.

Request

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

Response

```json
{
  "token": "...",
  "user": {
    ...
  }
}
```

---

# Devices

Device routes are responsible for managing paired ARO G1 devices.

Typical functionality includes:

- List user devices
- Pair new device
- Rename device
- Delete device
- Retrieve device information

---

# Device Client

These endpoints are intended for communication with the ARO G1 firmware.

Examples include:

- Upload telemetry
- Check pending commands
- Confirm executed commands
- Device authentication

These endpoints are generally accessed by the embedded firmware rather than the web application.

---

# Commands

Command endpoints allow users to remotely control paired devices.

Examples:

- Water Plant
- Refresh Telemetry


Commands are stored until retrieved by the device.

---

# Database

MongoDB stores:

- Users
- Devices
- Telemetry
- Pending Commands

Relationships are maintained using document references.

---

# Error Handling

The API returns consistent JSON responses.

Example

```json
{
  "message": "Unauthorized"
}
```

or

```json
{
  "message": "Device not found"
}
```

---

# Security

The server includes several security mechanisms:

- Helmet
- Password hashing
- JWT Authentication
- Rate Limiting
- Request Validation
- CORS Configuration

---

# Logging

Morgan is used for HTTP request logging during development.

---

# Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | Server port |
| MONGODB_URI | MongoDB connection string |
| JWT_SECRET | Secret used for JWT signing |
| JWT_EXPIRES_IN | JWT expiration time |
| CORS_ORIGINS | Allowed frontend origins |

---

# HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Resource created |
| 400 | Invalid request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Resource not found |
| 409 | Conflict |
| 500 | Internal server error |

---

# API Flow

```text
Web Client
     │
     │
     ▼
Node.js REST API
     │
     ├──────────────► MongoDB
     │
     └──────────────► ARO G1 Device
                        │
                        ├── Upload Telemetry
                        ├── Fetch Commands
                        └── Report Status
```
---

# License

This project is proprietary software.

© ARO. All rights reserved.