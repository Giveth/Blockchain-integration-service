import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export type ValidationSource = 'body' | 'params' | 'query';

export function validateRequest(
  schema: Joi.ObjectSchema,
  source: ValidationSource = 'body',
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const dataToValidate = req[source];
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
      return;
    }

    // Assign validated values back to request
    req[source] = value;

    next();
  };
}
