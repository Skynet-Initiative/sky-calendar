import helmet from "@fastify/helmet";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import "reflect-metadata";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: { redact: ["req.headers.authorization", "req.headers.cookie"] },
    }),
  );
  const config = app.get(ConfigService);

  await app.register(helmet, { contentSecurityPolicy: false });
  app.enableCors({
    origin: config
      .getOrThrow<string>("CORS_ORIGIN")
      .split(",")
      .map((value) => value.trim()),
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
  app.enableShutdownHooks();

  await app.listen(
    config.getOrThrow<number>("PORT"),
    config.getOrThrow<string>("HOST"),
  );
}

void bootstrap();
