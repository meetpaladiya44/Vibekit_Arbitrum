import { customProvider, extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { groq } from '@ai-sdk/groq';
import { xai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { isTestEnvironment } from '../constants';
import { artifactModel, chatModel, reasoningModel, titleModel } from './models.test';

console.log('🔍 [PROVIDERS] Initializing OpenRouter...');
console.log('🔍 [PROVIDERS] OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);

const openRouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

console.log('✅ [PROVIDERS] OpenRouter created successfully');

console.log('🔍 [PROVIDERS] Creating openRouterProvider...');
console.log('🔍 [PROVIDERS] isTestEnvironment:', isTestEnvironment);

export const openRouterProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': (() => {
          console.log('🔍 [PROVIDERS] Creating chat-model with meta-llama/llama-4-maverick:free');
          return openRouter('meta-llama/llama-4-maverick:free', {
            reasoning: {
              exclude: true,
              effort: 'low',
            },
          });
        })(),
        'chat-model-medium': (() => {
          console.log(
            '🔍 [PROVIDERS] Creating chat-model-medium with meta-llama/llama-4-maverick:free'
          );
          return openRouter('meta-llama/llama-4-maverick:free', {
            reasoning: {
              effort: 'medium',
            },
          });
        })(),
        'title-model': (() => {
          console.log('🔍 [PROVIDERS] Creating title-model with meta-llama/llama-4-maverick:free');
          return openRouter('meta-llama/llama-4-maverick:free');
        })(),
        'artifact-model': (() => {
          console.log(
            '🔍 [PROVIDERS] Creating artifact-model with meta-llama/llama-4-maverick:free'
          );
          return openRouter('meta-llama/llama-4-maverick:free');
        })(),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });

console.log('✅ [PROVIDERS] openRouterProvider created successfully');

export const grokProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': xai('grok-2-1212'),
        'chat-model-reasoning': wrapLanguageModel({
          model: groq('deepseek-r1-distill-llama-70b'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': xai('grok-2-1212'),
        'artifact-model': xai('grok-2-1212'),
      },
      imageModels: {
        'small-model': xai.image('grok-2-image'),
      },
    });
