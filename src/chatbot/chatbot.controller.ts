import { Body, Controller, HttpException, HttpStatus, Param, Post, Get } from '@nestjs/common';
import { ChatBotService } from './chatbot.service';
import openai from 'openai';

interface HistoryItem {
  content: string; // The text content of the chat
  timestamp?: Date; // Optional timestamp for when the message was created
}

interface ChatRequestBody {
  query: string;
  history: HistoryItem[];
}
@Controller('chatbot')
export class ChatBotController {
  constructor(
    private readonly chatBotService: ChatBotService
  ) { }

  @Post('chat/:userId/:chatId?')
  async chat(
    @Body() body: ChatRequestBody,
    @Param('userId') userId: string,
    @Param('chatId') chatId?: string,
  ) {
    try {
      // Validate required parameters
      if (!userId) {
        throw new HttpException('User ID is required.', HttpStatus.BAD_REQUEST);
      }

      const { query } = body;
      if (!query) {
        throw new HttpException('Query is required.', HttpStatus.BAD_REQUEST);
      }

      let chatHistory = [];
      let chatRecord;

      if (chatId) {
        // Fetch the chat record and validate ownership
        chatRecord = await this.chatBotService.getChatById(chatId, userId);
        if (!chatRecord) {
          throw new HttpException(
            'Chat not found or does not belong to the user.',
            HttpStatus.NOT_FOUND,
          );
        }

        // Fetch the chat history
        chatHistory = await this.chatBotService.getChatHistoryByChatId(chatId);
      } else {
        // Create a new chat if no chatId is provided
        const title = await this.chatBotService.generateTitle(query);
        chatRecord = await this.chatBotService.createChat(userId, title);
      }

      // Process the query with the chat service
      const { response } = await this.chatBotService.chat(query, chatHistory);

      // Save the new chat history entry
      await this.chatBotService.createChatHistory({
        chatId: chatRecord.uuid,
        query,
        response,
        order: chatHistory.length + 1, // Increment order based on existing history
      });

      // Return the response and chatId
      return { response, chatId: chatRecord.uuid };
    } catch (error) {
      console.error('Error in chat handler:', error);

      // Normalize error response
      const isHttpException = error instanceof HttpException;
      const statusCode = isHttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const message = isHttpException ? error.message : 'Internal Server Error';

      // Return a consistent error response
      throw new HttpException(
        { statusCode, message },
        statusCode,
      );
    }
  }

  // Endpoint to list chats for a user
  @Get('chat/:userId')
  async listChats(@Param('userId') userId: string) {
    return this.chatBotService.listChats(userId);
  }

  // Endpoint to list chat history for a specific chat
  @Get('chat-history/:chatId')
  async getChatHistory(@Param('chatId') chatId: string) {
    return this.chatBotService.getChatHistory(chatId);
  }

}
