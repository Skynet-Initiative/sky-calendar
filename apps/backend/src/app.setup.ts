import helmet from "@fastify/helmet";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * The HTTP surface every instance serves — headers, CORS, `/api/v1` and input
 * validation —, applied by `main.ts` and by the tests that drive the real
 * application, so that a test exercises the routes exactly as they are served.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get(ConfigService);
  await app.register(helmet, { contentSecurityPolicy: false });
  app.enableCors({
    origin: config
      .getOrThrow<string>("CORS_ORIGIN")
      .split(",")
      .map((value) => value.trim()),
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: false,
  });
  app.enableVersioning({ defaultVersion: "1", type: VersioningType.URI });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
