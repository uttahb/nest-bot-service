import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadController } from './upload/upload.controller';
import { UploadService } from './upload/upload.service';
import { LoggerMiddleware } from './logger';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AppController, UploadController, ChatController],
  providers: [AppService, UploadService, ChatService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'upload/file', method: RequestMethod.POST });
  }
}
