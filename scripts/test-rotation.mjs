import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadGameData, loadReleaseConfig, projectRoot } from './lib.mjs';

const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => m[2]);
const main = scripts.find((script) => script.includes('function chooseQuestion'));
if (!main) throw new Error('chooseQuestion script not found');

function extractFunction(name) {
  const marker = `function ${name}`;
  const start = main.indexOf(marker);
  if (start < 0) throw new Error(`function not found: ${name}`);
  const brace = main.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < main.length; i += 1) {
    const c = main[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return main.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function: ${name}`);
}

const functionNames = [
  'finiteNumber', 'availableQuestions', 'normalizeQuestionForSimilarity', 'questionKey',
  'questionSignature', 'signatureSimilarity', 'questionFamily', 'isNearRecentQuestion',
  'normalizeSpacingData', 'spacingKey', 'spacingStateFor', 'weightedQuestionPick', 'selectSpacedQuestion',
  'chooseQuestion', 'questionCategory', 'defaultLearningData', 'readLearningData'
];
const functions = functionNames.map(extractFunction).join('\n\n');
const D = loadGameData();
const config = loadReleaseConfig();
const testCode = `
const D=${JSON.stringify(D)};
const storage=new Map();
const localStorage={getItem:(k)=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))};
const LEARNING_KEY='chemionQuestLearningV1';
const SPACING_HOUR=60*60*1000;
const SPACING_DAY=24*SPACING_HOUR;
const SPACING_CORRECT_INTERVAL_DAYS=[3,7,14,30,45,60];
const SPACING_INCORRECT_DELAY_HOURS=12;
let selectedScope='all';
let currentStageId=1;
let recentQuestionHistory=[];
const EXACT_QUESTION_HISTORY_LIMIT=${config.questionHistory.exact};
const NEAR_QUESTION_HISTORY_LIMIT=${config.questionHistory.near};
const FAMILY_QUESTION_HISTORY_LIMIT=${config.questionHistory.family};
const CATEGORY_LABELS={mol:'mol・量的関係',acidBase:'酸・塩基',redox:'酸化還元',electrolysis:'電池・電気分解',crystal:'結晶',gas:'気体・溶液',thermo:'熱化学・反応速度',equilibrium:'化学平衡',matter:'物質の構成',other:'その他'};
${functions}
function assert(cond,msg){if(!cond)throw new Error(msg);}
function testPool(set,isHard,stage,draws){
  currentStageId=stage;recentQuestionHistory=[];const seen=[];
  for(let i=0;i<draws;i++){
    const x=chooseQuestion(set,isHard);const key=questionKey(x);
    const available=isHard?availableQuestions(set).filter(q=>!q.stageTier||q.stageTier===stage):availableQuestions(set);
    if(available.length>EXACT_QUESTION_HISTORY_LIMIT)assert(!seen.slice(-EXACT_QUESTION_HISTORY_LIMIT).includes(key),'exact repeat within limit');
    seen.push(key);
  }
}
testPool(D.quiz,false,1,500);
for(const stage of [1,2,3,4,5])testPool(D.hardQuiz,true,stage,200);
const synthetic=Array.from({length:48},(_,i)=>({id:'syn'+i,q:(String.fromCharCode(97+(i%26))+String.fromCharCode(97+Math.floor(i/26))).repeat(20),options:['a','b','c','d'],answer:0,scope:'foundation',similarityGroup:'g'+(i%12)}));
recentQuestionHistory=[];currentStageId=1;const families=[];
for(let i=0;i<120;i++){const x=chooseQuestion(synthetic,false);const family=questionFamily(x);assert(!families.slice(-FAMILY_QUESTION_HISTORY_LIMIT).includes(family),'family repeated within limit');families.push(family);}

// Spaced-selection test: overdue questions must be chosen substantially more often than future questions.
const scheduled=Array.from({length:60},(_,i)=>({id:'sched'+i,q:'scheduled '+i,options:['a','b','c','d'],answer:0,scope:'foundation',similarityGroup:'sg'+i}));
const now=Date.now();
const spacing=defaultLearningData();
for(let i=0;i<scheduled.length;i++){
  spacing.spacing.items[spacingKey(scheduled[i],false)]={attempts:1,dueAt:i<30?now-SPACING_DAY:now+30*SPACING_DAY,lapses:0,correctStreak:1};
}
localStorage.setItem(LEARNING_KEY,JSON.stringify(spacing));
let overdueChosen=0;
for(let i=0;i<1000;i++){
  recentQuestionHistory=[];
  const q=chooseQuestion(scheduled,false);
  if(Number(q.id.replace('sched',''))<30)overdueChosen++;
}
assert(overdueChosen>650,'overdue questions were not sufficiently prioritized: '+overdueChosen);
console.log('rotation and spacing test passed');

`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chemion-rotation-'));
try {
  const file = path.join(dir, 'rotation-test.js');
  fs.writeFileSync(file, testCode);
  execFileSync(process.execPath, [file], { stdio: 'inherit' });
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
