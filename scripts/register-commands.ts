import "dotenv/config";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID || !DISCORD_GUILD_ID) {
  console.error(
    "Error: DISCORD_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID must be set in .env"
  );
  process.exit(1);
}

const commands = [
  {
    name: "tyusen_start",
    type: 1,
    description:
      "抽選セッションを開始します。参加ボタン付きのメッセージを送信します。",
    options: [
      {
        name: "time",
        description: "発表時間（分）。セッション内の全抽選にデフォルト適用",
        type: 4,
        required: false,
        min_value: 1,
      },
    ],
  },
  {
    name: "tyusen_pick",
    type: 1,
    description: "参加表明者からランダムに抽選します。",
    options: [
      {
        name: "count",
        description: "抽選する人数（デフォルト: 1）",
        type: 4,
        required: false,
        min_value: 1,
      },
      {
        name: "time",
        description: "発表時間（分）。省略時はセッションのデフォルト値を使用",
        type: 4,
        required: false,
        min_value: 1,
      },
    ],
  },
  {
    name: "tyusen_end",
    type: 1,
    description: "抽選セッションを終了し、結果サマリーを表示します。",
  },
];

async function registerCommands(): Promise<void> {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`;

  console.log(`Registering ${commands.length} commands...`);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${DISCORD_TOKEN}`,
    },
    body: JSON.stringify(commands),
  });

  if (response.ok) {
    const data = await response.json();
    console.log(
      `Successfully registered ${(data as unknown[]).length} commands.`
    );
  } else {
    const errorText = await response.text();
    console.error(`Failed to register commands: ${response.status}`);
    console.error(errorText);
    process.exit(1);
  }
}

registerCommands();
