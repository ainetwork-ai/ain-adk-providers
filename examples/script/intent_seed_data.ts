// npx tsx examples/script/intent_seed_data.ts
import "dotenv/config";

import mongoose from "mongoose";
import { IntentModel } from "../../packages/memory/mongodb/models/intent.model";

// 더미 데이터 정의
const dummyIntents = [
  {
    name: "default",
    description: "기본 인텐트, 특별히 관련이 없는 인텐트일 때 반환하는 용도",
    prompt: "기본 응답을 제공합니다.",
    llm: "gpt-4o"
  },
  {
    name: "check_comcom_welfare",
    description: "ComCom의 복지 및 혜택 정보를 알고 싶을 때",
    prompt: "ComCom의 복지 및 혜택 정보를 안내해드릴게요.",
    llm: "gpt-4o"
  },
  {
    name: "onboard_new_onprem_server",
    description: "ComCom에서 신규 온프렘(사내) 서버를 구축하거나 온보딩할 때",
    prompt: "신규 온프렘 서버 구축 및 온보딩을 도와드릴게요.",
    llm: "gpt-4o"
  },
  {
    name: "check_comcom_rules",
    description: "ComCom의 사내 규칙 및 정책을 확인할 때",
    prompt: "ComCom의 사내 규칙 및 정책을 안내해드릴게요.",
    llm: "gpt-4o"
  },
  {
    name: "check_task_list",
    description: "현재 할당된 태스크(업무) 목록을 확인할 때",
    prompt: "현재 할당된 태스크 목록을 확인해드릴게요.",
    llm: "gpt-4o"
  },
  {
    name: "get_comcom_info",
    description: "ComCom의 기본 정보가 필요할 때",
    prompt: "ComCom의 기본 정보를 안내해드릴게요.",
    llm: "gpt-4o"
  },
  {
    name: "electing_user_value_daily_winners",
    description: "'user value daily' 슬랙 채널에서 우수한 성적을 받은 사용자를 선정하는 인텐트",
    prompt: "1. slack #user-value-daily 채널에서 메세지를 가져온다.\n"+
    "2. comcom notion의 life at comcom 문서에 정리된 정보를 가져온다.\n"+
    "3. 문서를 참고하여 각 메세지에 대한 점수를 매긴다.\n"+
    "4. 평균적으로 가장 높은 점수를 받은 사용자를 선정한다.\n"+
    "5. 선정된 사용자들의 이름과 점수, 그 이유를 반환한다.",
    llm: "gpt-4o"
  }
];

async function seedIntentData() {
  try {
    // MongoDB 연결
    const connectionString = process.env.MONGO_DB_CONNECTION_STRING || "";
    if (!connectionString) {
      throw new Error("MONGO_DB_CONNECTION_STRING 환경변수가 설정되지 않았습니다.");
    }

    console.log("MongoDB에 연결 중...");
    await mongoose.connect(connectionString);
    console.log("MongoDB 연결 성공!");
    // 데이터베이스 및 컬렉션 정보 출력
    const dbName = mongoose.connection.db?.databaseName || "unknown";
    const collectionName = IntentModel.collection.name;
    console.log(`\n📊 데이터베이스 정보:`);
    console.log(`   데이터베이스: ${dbName}`);
    console.log(`   컬렉션: ${collectionName}`);

    // 기존 데이터 삭제 (선택사항)
    console.log("기존 Intent 데이터 삭제 중...");
    await IntentModel.deleteMany({});
    console.log("기존 데이터 삭제 완료");

    // 더미 데이터 삽입
    console.log("더미 데이터 삽입 중...");
    const insertedIntents = await IntentModel.insertMany(dummyIntents);
    console.log(`${insertedIntents.length}개의 Intent 데이터가 성공적으로 삽입되었습니다.`);

    // 삽입된 데이터 확인
    console.log("\n삽입된 데이터:");
    const allIntents = await IntentModel.find({});
    allIntents.forEach((intent, index) => {
      console.log(`${index + 1}. ${intent.name} - ${intent.description}`);
    });
    console.log(`\n   총 문서 수: ${allIntents.length}개`);

  } catch (error) {
    console.error("데이터 삽입 중 오류 발생:", error);
    process.exit(1);
  } finally {
    // 연결 종료
    await mongoose.disconnect();
    console.log("MongoDB 연결 종료");
  }
}

// 스크립트 실행
if (require.main === module) {
  seedIntentData()
    .then(() => {
      console.log("더미 데이터 삽입 완료!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("스크립트 실행 중 오류:", error);
      process.exit(1);
    });
}

export { seedIntentData };
