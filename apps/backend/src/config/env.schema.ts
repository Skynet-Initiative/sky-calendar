import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4010),
    DATABASE_URL: z.string().min(1),
    PLATFORM_MINTER_PUBLIC_KEYS: z
      .string()
      .min(1)
      .refine((value) =>
        value.split(",").every((key) => key.trim().length > 0),
      ),
    PLATFORM_TOKEN_AUDIENCE: z.string().min(1).default("sky-calendar"),
    CORS_ORIGIN: z.string().min(1),
    CONTROL_PLANE_TOKEN: z.string().trim().min(32).max(4_096).optional(),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      environment.CONTROL_PLANE_TOKEN === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "CONTROL_PLANE_TOKEN is required in production",
        path: ["CONTROL_PLANE_TOKEN"],
      });
    }
  });

export type Environment = z.infer<typeof schema>;

export function validateEnv(input: Record<string, unknown>): Environment {
  return schema.parse(input);
}
