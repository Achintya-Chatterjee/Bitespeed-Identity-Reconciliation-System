import express, { Express, Request, Response } from "express";
import bodyParser from "body-parser";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import identifyRoute from "./routes/identify";

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

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
        url: `http://localhost:${port}`,
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
