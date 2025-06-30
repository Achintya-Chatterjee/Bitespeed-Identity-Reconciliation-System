import { Request, Response } from "express";
import { ContactService } from "../services/contactService";
import { IdentifyRequest, IdentifyResponse } from "../types/identify";

const contactService = new ContactService();

export const identifyController = async (req: Request, res: Response) => {
  const { email, phoneNumber }: IdentifyRequest = req.body;

  if (!email && !phoneNumber) {
    return res
      .status(400)
      .json({ message: "Email or phone number must be provided." });
  }

  try {
    const result: IdentifyResponse = await contactService.identify(
      email ?? null,
      phoneNumber ? String(phoneNumber) : null
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
