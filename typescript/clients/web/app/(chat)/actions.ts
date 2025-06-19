'use server';

import { generateText, Message } from 'ai';
import { cookies } from 'next/headers';

import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import { VisibilityType } from '@/components/visibility-selector';
import { openRouterProvider } from '@/lib/ai/providers';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function saveChatAgentAsCookie(agent: string) {
  const cookieStore = await cookies();
  cookieStore.set('agent', agent);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: Message;
}) {
  console.log('🔍 [ACTIONS] Starting generateTitleFromUserMessage...');
  console.log('🔍 [ACTIONS] Input message:', JSON.stringify(message, null, 2));

  try {
    console.log('🔍 [ACTIONS] Getting title-model from openRouterProvider...');
    const model = openRouterProvider.languageModel('title-model');
    console.log('✅ [ACTIONS] Model retrieved successfully');

    const systemPrompt = `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`;

    const promptText = JSON.stringify(message);
    console.log('🔍 [ACTIONS] System prompt:', systemPrompt);
    console.log('🔍 [ACTIONS] Prompt text length:', promptText.length);

    console.log('🔍 [ACTIONS] Calling generateText...');
    const { text: title } = await generateText({
      model,
      system: systemPrompt,
      prompt: promptText,
    });

    console.log('✅ [ACTIONS] Title generated successfully:', title);
    console.log('🔍 [ACTIONS] Title length:', title.length);

    return title;
  } catch (error) {
    console.error('❌ [ACTIONS] Error in generateTitleFromUserMessage:', error);
    console.error('❌ [ACTIONS] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}
