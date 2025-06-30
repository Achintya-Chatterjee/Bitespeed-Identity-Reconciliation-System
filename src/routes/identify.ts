import { Router } from 'express';
import { identifyController } from '../controllers/identifyController';

const router = Router();

/**
 * @openapi
 * /identify:
 *   post:
 *     summary: Identify a contact
 *     description: Identifies a customer and consolidates their contact information.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email of the contact.
 *                 example: "lorraine@hillvalley.edu"
 *               phoneNumber:
 *                 type: string
 *                 description: The phone number of the contact.
 *                 example: "123456"
 *     responses:
 *       '200':
 *         description: A consolidated contact object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contact:
 *                   type: object
 *                   properties:
 *                     primaryContactId:
 *                       type: integer
 *                     emails:
 *                       type: array
 *                       items:
 *                         type: string
 *                     phoneNumbers:
 *                       type: array
 *                       items:
 *                         type: string
 *                     secondaryContactIds:
 *                       type: array
 *                       items:
 *                         type: integer
 *       '400':
 *         description: Bad request, email and phoneNumber cannot be both null.
 *       '500':
 *         description: Internal server error.
 */
router.post('/identify', identifyController);

export default router; 