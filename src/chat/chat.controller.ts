import { Body, Controller, Param, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

interface HistoryItem {
  role: string;
  content: string;
}
interface ChatRequestBody {
  query: string;
  history: HistoryItem[];
}
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}
  @Post('query/:userId')
  async query(@Body() body: ChatRequestBody, @Param('userId') userId: string) {
    const response = await this.chatService.query(
      userId,
      body.query,
      body.history,
    );
    return {
      response: response.text,
      source: response.sourceDocuments,
    };
  }

  @Post('query-all/:userId')
  async queryAll(
    @Body() body: ChatRequestBody,
    @Param('userId') userId: string,
  ) {
    const response = await this.chatService.queryAll(
      userId,
      body.query,
      body.history,
    );
    return {
      response: response.text,
      source: response.sourceDocuments,
    };
  }
}
