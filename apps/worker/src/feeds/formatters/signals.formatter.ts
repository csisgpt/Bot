import { Signal } from '@libs/signals';
import { formatSignalMessage } from '@libs/telegram';

export const formatSignalFeedMessage = (signal: Signal): string => formatSignalMessage(signal);
