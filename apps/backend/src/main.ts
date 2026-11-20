import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import "reflect-metadata";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: { redact: ["req.headers.authorization", "req.headers.cookie"] },
    }),
  );
  const config = app.get(ConfigService);

  await configureApp(app);
  app.enableShutdownHooks();

  await app.listen(
    config.getOrThrow<number>("PORT"),
    config.getOrThrow<string>("HOST"),
  );
}

void bootstrap();
