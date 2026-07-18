import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, readJson } from './lib.mjs';

const basic = readJson('data/basic-questions.json');
const hard = readJson('data/hard-questions.json');
const exams = readJson('data/mock-exams.json');
const config = readJson('config/release.json');
const required = ['id','category','difficultyLevel','cognitiveType','learningObjective','estimatedSeconds','similarityGroup','optionFeedback'];
const failures = [];
const normalize = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[。．,.，、!?！？「」『』()（）]/g,'');
const normalizeOption = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[。．，、!?！？「」『』()（）]/g,'');

const SUPERSCRIPT_DIGITS = new Map(Object.entries({ '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁺':'+','⁻':'-' }));
function parseNumericChoice(value) {
  const text=String(value ?? '').trim().replaceAll('−','-');
  const match=text.match(/^([^\d+\-]*)([+\-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*[×x]\s*10(?:\^?([+\-]?\d+)|([⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)))?([^\d]*)$/u);
  if(!match) return null;
  const exponentText=match[3] ?? [...(match[4] ?? '')].map((char)=>SUPERSCRIPT_DIGITS.get(char) ?? char).join('');
  const exponent=Number(exponentText || 0); const base=Number(match[2]);
  if(!Number.isFinite(exponent)||!Number.isFinite(base)) return null;
  return {prefix:match[1].trim(),suffix:match[5].trim(),value:base*(10**exponent)};
}
function numericCorrectRank(question) {
  const parsed=(question.options||[]).map(parseNumericChoice);
  if(parsed.length!==4 || !parsed.every(Boolean)) return null;
  if(new Set(parsed.map((item)=>item.prefix)).size!==1 || new Set(parsed.map((item)=>item.suffix)).size!==1) return null;
  const values=parsed.map((item)=>item.value);
  if(new Set(values).size!==4) return null;
  return [...values].sort((a,b)=>a-b).indexOf(values[question.answer])+1;
}

function analyze(name, list) {
  const ids = new Set();
  const textCounts = new Map();
  const category = new Map();
  const cognitive = new Map();
  const answers = [0,0,0,0];
  const numericRanks = [0,0,0,0];
  for (const [index,q] of list.entries()) {
    for (const key of required) {
      const value = q[key];
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) failures.push(`${name}[${index}] missing ${key}`);
    }
    if (!Array.isArray(q.optionFeedback) || q.optionFeedback.length !== 4) failures.push(`${name}[${index}] optionFeedback must have 4 entries`);
    if (!Array.isArray(q.options) || q.options.length !== 4) failures.push(`${name}[${index}] options must have 4 entries`);
    if (Array.isArray(q.options) && new Set(q.options.map(normalizeOption)).size !== 4) failures.push(`${name}[${index}] has duplicate normalized options`);
    if (q.negativeQuestion && q.singleCorrectVerified !== true) failures.push(`${name}[${index}] negative question lacks singleCorrectVerified`);
    if ((String(q.q).includes('現れない') || String(q.q).includes('正しくない')) && !q.negativeQuestion) failures.push(`${name}[${index}] negative wording lacks negativeQuestion flag`);
    if (String(q.id ?? '').includes('v58-') && (!q.referenceBasis || String(q.referenceBasis).length < 20)) failures.push(`${name}[${index}] v5.8 question lacks referenceBasis`);
    if (String(q.id ?? '').includes('v58-') && (String(q.q).includes('軌道') || q.visual === 'orbitals') && !String(q.q).includes('【前提】') && !String(q.explanation).includes('前提')) failures.push(`${name}[${index}] orbital question lacks prerequisite explanation`);
    if (ids.has(q.id)) failures.push(`${name} duplicate id ${q.id}`);
    ids.add(q.id);
    const text = normalize(q.q);
    textCounts.set(text,(textCounts.get(text)||0)+1);
    category.set(q.category,(category.get(q.category)||0)+1);
    cognitive.set(q.cognitiveType,(cognitive.get(q.cognitiveType)||0)+1);
    if (Number.isInteger(q.answer) && q.answer>=0 && q.answer<4) answers[q.answer]+=1;
    if (String(q.id ?? '').startsWith('v4-') && q.calculation) { const rank=numericCorrectRank(q); if(rank) numericRanks[rank-1]+=1; }
  }
  for (const [text,count] of textCounts) if (count>1) failures.push(`${name} has ${count} exact duplicate question texts: ${text.slice(0,60)}`);
  const max = Math.max(...answers), min = Math.min(...answers);
  if (max-min > Math.max(2, Math.ceil(list.length*0.03))) failures.push(`${name} answer positions are too imbalanced: ${answers.join('/')}`);
  const ranked=numericRanks.reduce((a,b)=>a+b,0);
  if(ranked>=12 && Math.max(...numericRanks)-Math.min(...numericRanks)>Math.max(6,Math.ceil(ranked*0.15))) failures.push(`${name} numeric correct ranks are too imbalanced: ${numericRanks.join('/')}`);
  return {name,count:list.length,category:[...category.entries()].sort((a,b)=>b[1]-a[1]),cognitive:[...cognitive.entries()].sort((a,b)=>b[1]-a[1]),answers,numericRanks};
}
const reports=[analyze('基本問題',basic),analyze('難問',hard)];
const mockQuestions=exams.flatMap((exam)=>exam.questions||[]);
const mockAnswers=[0,0,0,0]; for (const q of mockQuestions) mockAnswers[q.answer]+=1;
if (Math.max(...mockAnswers)-Math.min(...mockAnswers)>2) failures.push(`実戦問題 answer positions are imbalanced: ${mockAnswers.join('/')}`);
if (basic.length!==config.expectedCounts.basic) failures.push(`basic count ${basic.length}`);
if (hard.length!==config.expectedCounts.hard) failures.push(`hard count ${hard.length}`);
if (exams.length!==config.expectedCounts.mockExams) failures.push(`mock exam count ${exams.length}`);
if (mockQuestions.length!==config.expectedCounts.mockQuestions) failures.push(`mock question count ${mockQuestions.length}`);

const lines=[`# Chemion Quest v${config.version} 問題品質レポート`,'',`生成日時: ${new Date().toISOString()}`,'',`総問題数相当: **${basic.length+hard.length+mockQuestions.length}**（基本${basic.length}＋難問${hard.length}＋実戦小問${mockQuestions.length}）`,''];
for (const report of reports) {
  lines.push(`## ${report.name}（${report.count}問）`,'',`正答位置: A ${report.answers[0]} / B ${report.answers[1]} / C ${report.answers[2]} / D ${report.answers[3]}`,`v4.0以降に追加した数値計算問題における正解の大小順位: 最小 ${report.numericRanks[0]} / 2番目 ${report.numericRanks[1]} / 3番目 ${report.numericRanks[2]} / 最大 ${report.numericRanks[3]}`,'','### 分野別','',...report.category.map(([key,value])=>`- ${key}: ${value}問`),'','### 問い方別','',...report.cognitive.map(([key,value])=>`- ${key}: ${value}問`),'');
}
const v58Added=[...basic,...hard].filter((q)=>String(q.id ?? '').includes('v58-'));
const v58Negatives=v58Added.filter((q)=>q.negativeQuestion);
const v58Orbitals=v58Added.filter((q)=>String(q.q ?? '').includes('【前提】') || q.visual === 'orbitals');
lines.push('## v5.8追加問題','',`- 追加: ${v58Added.length}問（基本${v58Added.filter((q)=>String(q.id).startsWith('basic-')).length}＋難問${v58Added.filter((q)=>String(q.id).startsWith('hard-')).length}）`,`- 否定形専用監査: ${v58Negatives.length}問`,`- 軌道・電子配置の前提説明対象: ${v58Orbitals.length}問`,'- 追加問題は全て参照根拠フィールドを保持し、過去問の転載ではなく独自作成','');
lines.push('## 実戦問題','',`- ${exams.length}大問・${mockQuestions.length}小問`,`- 正答位置: A ${mockAnswers[0]} / B ${mockAnswers[1]} / C ${mockAnswers[2]} / D ${mockAnswers[3]}`,'','## 自動検査','',`- 問題ID重複: ${failures.some((x)=>x.includes('duplicate id'))?'要修正':'なし'}`,`- 問題文の完全重複: ${failures.some((x)=>x.includes('duplicate question'))?'要修正':'なし'}`,'- 4択・正答番号・選択肢フィードバック・学習目標・類題グループを総合検査','- 正規化後の選択肢重複、否定形フラグ、単一正解確認、軌道問題の前提説明、参照根拠を検査','- 数値選択肢は総合validatorで、重複値と正解の10倍・100倍・1000倍／逆数桁移動を検査','- v4.0以降に追加した数値計算問題は、正解が常に最小・2番目などにならないよう大小順位の偏りも検査','');
fs.writeFileSync(path.join(projectRoot,'docs/QUESTION_QUALITY_REPORT.md'),`${lines.join('\n')}\n`);
if (failures.length) {
  console.error('Question quality audit failed:');
  failures.forEach((failure)=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Question quality audit passed (${basic.length+hard.length+mockQuestions.length} items).`);
