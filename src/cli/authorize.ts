#!/usr/bin/env node

import * as readline from 'readline';
import { NalogApi } from '../NalogApi';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('=== Авторизация в API "Мой налог" ===\n');

  const phone = await question('Введите номер телефона (например, +7 999 123-45-67): ');

  if (!phone.trim()) {
    console.error('Номер телефона не указан');
    process.exit(1);
  }

  const api = new NalogApi({
    saveToken: true,
    saveTokenPath: 'session-token.json',
  });

  console.log('\nОтправка SMS-кода...');

  let challengeToken: string;
  try {
    challengeToken = await api.requestSmsCode(phone);
    console.log('SMS-код отправлен!\n');
  } catch (error) {
    console.error('Ошибка отправки SMS:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const code = await question('Введите код из SMS: ');

  if (!code.trim()) {
    console.error('Код не указан');
    process.exit(1);
  }

  console.log('\nАвторизация...');

  try {
    const result = await api.authByPhone(phone, challengeToken, code.trim());

    console.log('\n✓ Авторизация успешна!');
    console.log(`  ИНН: ${result.profile?.inn || api.getInn()}`);
    if (result.profile?.displayName) {
      console.log(`  Имя: ${result.profile.displayName}`);
    }
    console.log(`  Токен сохранён в: session-token.json\n`);
  } catch (error) {
    console.error('Ошибка авторизации:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  rl.close();
}

main();
