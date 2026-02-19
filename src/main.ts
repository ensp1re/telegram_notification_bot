import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ApiResponseInterceptor, ApiExceptionFilter } from "./common/api-response";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v3");

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Twitter Scraper API")
    .setDescription(
      "Scalable Twitter scraper API powered by rotating accounts and proxies",
    )
    .setVersion("3.0.0")
    .addServer(`http://localhost:${process.env.PORT ?? 3000}`)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/v3/docs", app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api/v3`, "Bootstrap");
  Logger.log(
    `Swagger UI at http://localhost:${port}/api/v3/docs`,
    "Bootstrap",
  );
}

bootstrap();
