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
  query(@Body() body: ChatRequestBody, @Param('userId') userId: string) {
    return this.chatService.query(userId, body.query, body.history);
  }
}
