import express, { Express, Request, Response } from "express";
import bodyParser from "body-parser";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import identifyRoute from "./routes/identify";
import cors from "cors";

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const swaggerServerUrl = process.env.NODE_ENV === "production"
    ? "https://bitespeed-identity-api-d81d.onrender.com"
    : `http://localhost:${port}`;

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Bitespeed Identity Reconciliation API",
      version: "1.0.0",
      description: "API for identifying and tracking customer contacts.",
    },
    servers: [
      {
        url: swaggerServerUrl,
      },
    ],
  },
  apis: ["./src/routes/*.ts"],
};

const specs = swaggerJsdoc(options);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

app.get("/", (req: Request, res: Response) => {
  res.redirect("/api-docs");
});

app.use("/", identifyRoute);

const server = app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

export { app, server };
