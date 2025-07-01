import { Request, Response, RequestHandler } from "express";
import { ContactService } from "../services/contactService";
import { IdentifyRequest, IdentifyResponse } from "../types/identify";

const contactService = new ContactService();

export const identifyController: RequestHandler = async (
  req: Request,
  res: Response
) => {
  const { email, phoneNumber }: IdentifyRequest = req.body;

  if (!email && !phoneNumber) {
    res
      .status(400)
      .json({ message: "Email or phone number must be provided." });
    return;
  }

  try {
    const result: IdentifyResponse = await contactService.identify(
      email ?? null,
      phoneNumber ? String(phoneNumber) : null
    );
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
