export const speechText = {
  play: (value: string) => `Озвучить: ${value}`,
  stop: (value: string) => `Остановить озвучку: ${value}`,
  unsupported: 'Этот браузер не поддерживает озвучку.',
  missingVoice: 'Нет голоса для этого языка. Добавьте его в настройках устройства.',
  failed: 'Не удалось воспроизвести звук. Попробуйте ещё раз.',
} as const;
