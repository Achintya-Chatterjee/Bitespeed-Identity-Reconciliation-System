# Bitespeed Identity Reconciliation System

This project is a web service for identifying and tracking customer identities for FluxKart.com, as part of the Bitespeed backend task.

## Problem Statement

FluxKart faces a challenge in linking different orders made with different contact information (email/phone number) to the same customer. This service provides an `/identify` endpoint to consolidate contact information.

## Tech Stack

- **Backend:** Node.js, Express.js, TypeScript
- **Database:** PostgreSQL (running in Docker)
- **ORM:** Prisma
- **API Documentation:** Swagger (OpenAPI)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Docker](https://www.docker.com/get-started) and Docker Compose

### 1. Clone the repository

```bash
git clone git@github.com:Achintya-Chatterjee/Bitespeed-Identity-Reconciliation-System.git
cd bitespeed-identity-reconciliation
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root of the project and add the following line:

```
DATABASE_URL="postgresql://user:password@localhost:5432/bitespeed?schema=public"
```

### 4. Start the database

Run the PostgreSQL database container using Docker Compose:

```bash
docker-compose up -d
```

### 5. Run database migrations

Apply the database schema to the running database:

```bash
npx prisma migrate dev --name init
```

### 6. Run the application

You can run the application in development mode, which will automatically restart the server on file changes.

```bash
npm run dev
```

The server will start on `http://localhost:3000`.

## API Documentation

Once the server is running, you can access the interactive Swagger API documentation at:

[http://localhost:3000/api-docs](http://localhost:3000/api-docs)

This UI allows you to inspect the `/identify` endpoint and make test requests directly from your browser.

## Hosted Endpoint

The live service is hosted at the following URL:

`[Link to your hosted Render/Heroku/etc. endpoint]`

You can send `POST` requests to the `/identify` endpoint on the hosted service.

**Example using cURL:**

```bash
curl -X POST 'YOUR_HOSTED_URL/identify' \
--header 'Content-Type: application/json' \
--data-raw '{
    "email": "mcfly@hillvalley.edu",
    "phoneNumber": "123456"
}'
``` 