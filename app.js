(() => {
'use strict';
const $ = id => document.getElementById(id);
const STORAGE = 'wordlab-v3-save'; // Retain earlier players' progress.
const ONLINE_SOURCE = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';
const ONLINE_LOOKUP = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const ONLINE_CACHE_DAYS = 30;
const MODE_INFO = {
 classic:['CLASSIC','One puzzle, then reveal the answer.'],
 unlimited:['UNLIMITED','Solve as many words as you like, at your own pace.'],
 daily:['DAILY','One seeded answer per UTC day for each rule configuration.'],
 speedrun:['SPEEDRUN','Race through as many words as possible before time runs out.'],
 survival:['SURVIVAL','Each win advances your run. One failed word ends it.'],
 multi:['MULTI-WORD','Each guess applies to all unsolved boards at the same time.'],
 blind:['BLIND','Tile feedback stays visible, but the keyboard never remembers colors.'],
 reverse:['REVERSE','Choose a word and watch the computer guess it.'],
 custom:['CUSTOM CHALLENGE','Set the hidden word or import a challenge code.'],
 progression:['PROGRESSION','Each two victories increase the word length; difficulty rises too.'],
 practice:['PRACTICE','Retry words you previously failed, or train on random words.'],
 chain:['CHAIN REACTION','Each neighboring word pair makes a familiar phrase. Solve the links in order.']
};
// Only relevant customization controls are shown in each mode; disabled rules
// never influence answer selection, daily seeds, or saved configurations.
const DEFAULT_RULES={seedEnabled:false,seedValue:'',chainTheme:'*',chainMin:0,chainMax:0,chainCount:0,difficulty:'normal',length:'5',attempts:6,repeats:'allow',clock:'off',duration:180,multiCount:4,survivalType:'standard',easyLetters:0,hintStartEnabled:false,hintLastEnabled:false,hardRules:false,selected:[]};
const FLEXIBLE=['difficulty','length','attempts','repeats','clock','duration','easyLetters','hintStartEnabled','hintLastEnabled','hardRules','categories'];
const MODE_ALLOWED={
 classic:[],daily:['length','attempts'],unlimited:FLEXIBLE,speedrun:FLEXIBLE.filter(x=>x!=='clock'),
 survival:[...FLEXIBLE,'survivalType'],multi:[...FLEXIBLE,'multiCount'],blind:FLEXIBLE,
 reverse:['secret','attempts'],custom:['secret','attempts','hintStartEnabled','hintLastEnabled','hardRules'],
 progression:FLEXIBLE,practice:FLEXIBLE,
 chain:['attempts','clock','duration','hintStartEnabled','hintLastEnabled','hardRules','chainTheme','chainMin','chainMax','chainCount']
};
const BASE_SAVE = () => ({ settings:null,stats:{played:0,wins:0,totalWinGuesses:0,streak:0,bestStreak:0,solvedWords:0},recent:[],missed:[],daily:{},customWords:{},active:null });
const formFields = ['mode','seedEnabled','seedValue','chainTheme','chainMin','chainMax','chainCount','difficulty','length','attempts','repeats','clock','duration','multiCount','survivalType','easyLetters','hintStartEnabled','hintLastEnabled','hardRules'];
let categories={}, chains={}, dictionary=new Set(), allAnswers=[], selected=new Set(), app=BASE_SAVE(), active=null, ready=false, installPrompt=null;
let sessionConfig=null, ticker=null, onlineBusy=false, onlineState='offline', onlineCount=0, validating=false;
let seedError='';
function newSeed(){const bytes=new Uint32Array(2);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else{bytes[0]=Math.floor(Math.random()*4294967296);bytes[1]=Date.now()>>>0;}return [...bytes].map(n=>n.toString(36)).join('-');}
function loadSaved(){try{const s=JSON.parse(localStorage.getItem(STORAGE)||'null');if(s&&typeof s==='object'&&s.stats&&Array.isArray(s.recent)){app={...BASE_SAVE(),...s,stats:{...BASE_SAVE().stats,...s.stats}};}}catch(e){console.warn('Saved progress unavailable',e);$('saveState').textContent='● Session only';}}
function save(){app.active=active;if(active?.config?.mode==='daily')app.daily[active.dailyKey]=structuredCloneSafe(active);try{localStorage.setItem(STORAGE,JSON.stringify(app));$('saveState').textContent='● Saved locally';}catch(err){$('saveState').textContent='● Session only';}}
function structuredCloneSafe(obj){return JSON.parse(JSON.stringify(obj));}
function configFromForm(){
 const mode=MODE_INFO[$('mode').value]?$('mode').value:'unlimited';
 const allow=new Set(MODE_ALLOWED[mode]);const c={mode,...structuredCloneSafe(DEFAULT_RULES)};
 for(const id of formFields){if(id==='mode'||id==='seedEnabled'||id==='seedValue'||!allow.has(id))continue;const field=$(id);c[id]=field.type==='checkbox'?field.checked:field.value;}
 c.attempts=Math.max(3,Math.min(20,Number(c.attempts)||6));
 c.duration=Math.max(30,Math.min(900,Number(c.duration)||180));
 c.multiCount=[2,4,8].includes(Number(c.multiCount))?Number(c.multiCount):4;
 c.easyLetters=Math.max(0,Math.min(2,Number(c.easyLetters)||0));
 c.selected=allow.has('categories')?[...selected].sort():[];
 c.seedEnabled=mode!=='daily'&&mode!=='custom'&&mode!=='reverse'&&$('seedEnabled').checked;
 c.seedValue=c.seedEnabled?$('seedValue').value.trim():'';
 c.chainMin=Math.max(0,Math.min(9,Number(c.chainMin)||0));
 c.chainMax=Math.max(0,Math.min(9,Number(c.chainMax)||0));
 c.chainCount=Math.max(0,Math.min(9,Number(c.chainCount)||0));
 if(mode==='speedrun')c.clock='down';
 if(mode==='classic'){c.length='5';c.attempts=6;}
 if(mode==='reverse'||mode==='custom')c.length='5'; // Actual length comes from the secret.
 return c;
}
function restoreForm(c){if(!c)return;for(const id of formFields){if(c[id]===undefined)continue;const field=$(id);if(field.type==='checkbox')field.checked=!!c[id];else field.value=String(c[id]);}selected=new Set(Array.isArray(c.selected)?c.selected:[]);}
function setupConditional(){
 const mode=$('mode').value,allow=new Set(MODE_ALLOWED[mode]||[]);
 for(const id of [...formFields.filter(x=>x!=='mode'&&x!=='multiCount'&&x!=='survivalType'&&x!=='easyLetters'&&x!=='seedEnabled'&&x!=='seedValue'&&x!=='chainTheme'&&x!=='chainMin'&&x!=='chainMax'&&x!=='chainCount'),'secret']){
  const node=$(id);if(!node)continue;
  const parent=node.closest('label');
  if(parent)parent.hidden=!allow.has(id);
  node.disabled=!allow.has(id);
 }
 const showMulti=mode==='multi',showSurvival=mode==='survival',showCustom=mode==='custom'||mode==='reverse',showChain=mode==='chain';
 $('seedOptions').hidden=mode==='daily'||mode==='custom'||mode==='reverse';
 $('seedValue').disabled=$('seedOptions').hidden||!$('seedEnabled').checked;
 $('seedTextField').hidden=$('seedOptions').hidden||!$('seedEnabled').checked;
 $('chainOptions').classList.toggle('visible',showChain);
 for(const id of ['chainTheme','chainMin','chainMax','chainCount'])$(id).disabled=!showChain;
 $('multiOptions').classList.toggle('visible',showMulti);
 $('survivalOptions').classList.toggle('visible',showSurvival);
 $('customOptions').classList.toggle('visible',showCustom);
 $('easyOptions').classList.toggle('visible',allow.has('easyLetters')&&$('difficulty').value==='easy');
 $('multiCount').disabled=!showMulti;$('survivalType').disabled=!showSurvival;$('easyLetters').disabled=!allow.has('easyLetters')||$('difficulty').value!=='easy';
 for(const id of ['hintStartEnabled','hintLastEnabled','hardRules']){
  const label=$(id).closest('label');if(label)label.hidden=!allow.has(id);
 }
 const useDuration=allow.has('duration')&&(mode==='speedrun'||$('clock').value==='down');
 $('durationField').hidden=!useDuration;$('duration').disabled=!useDuration;
 $('categorySection').hidden=!allow.has('categories');
 rootToggleVisibility(allow);
 const hasExtra=['difficulty','length','attempts','repeats','clock','hintStartEnabled','hintLastEnabled','hardRules'].some(x=>allow.has(x));
 $('rulesNote').hidden=hasExtra;
 $('rulesNote').textContent=mode==='classic'?'Classic rules are fixed: 5 letters, 6 attempts, no timer, no hints, any topic.':mode==='daily'?'Daily puzzles only allow word length and attempts; all other rules are fixed.':'';
 $('modeHelp').textContent=MODE_INFO[mode]?.[1]||'';
 $('secret').placeholder=mode==='reverse'?'Word for the computer to guess':'Enter a real English word';
 updateAvailability();
}
function rootToggleVisibility(allowed){document.querySelector('.toggles').hidden=!['hintStartEnabled','hintLastEnabled','hardRules'].some(id=>allowed.has(id));}
function wordSet(){if(!selected.size)return allAnswers;const output=new Set();for(const key of selected){const [a,b]=key.split('|||');for(const w of categories[a]?.[b]||[])output.add(w);}return [...output];}
function repeated(w){return new Set(w).size!==w.length;}
function available(c,len){let out=wordSet().filter(w=>w.length===len&&(c.repeats==='allow'||(c.repeats==='require'?repeated(w):!repeated(w))));return out;}
function lengths(c){if(c.length!=='random'){const n=Number(c.length);return available(c,n).length?[n]:[];}return [3,4,5,6,7,8,9].filter(l=>available(c,l).length);}
function toughness(w){const rare='jqxz';const unusual='vkwy';const vowels=(w.match(/[aeiou]/g)||[]).length;let score=0;for(const ch of w){if(rare.includes(ch))score+=4;else if(unusual.includes(ch))score+=1.7;}score+=Math.max(0,w.length-5)*.5+((w.match(/[^aeiou]{3,}/g)||[]).length)*1.4+(repeated(w)?2:0)+((vowels<=1)?1.1:0);return score;}
function difficultyPool(words,diff){if(words.length<=4||diff==='normal')return words;const sorted=words.slice().sort((a,b)=>toughness(a)-toughness(b)||a.localeCompare(b));const n=sorted.length;switch(diff){case 'easy':return sorted.slice(0,Math.max(1,Math.ceil(n*.48)));case 'hard':return sorted.slice(Math.floor(n*.52));case 'expert':return sorted.slice(Math.floor(n*.80));default:return sorted;}}
function chainSegments(cfg){
 const themes=cfg.chainTheme==='*'?Object.keys(chains):[cfg.chainTheme];
 const minimum=cfg.chainMin||3, maximum=cfg.chainMax||9;
 if(minimum>maximum)return [];
 const segments=[];
 for(const theme of themes){
  const trails=chains[theme]||[];
  for(let t=0;t<trails.length;t++){
   const trail=trails[t];
   for(let a=0;a<trail.length;a++){
    for(let count=3;count<=Math.min(9,trail.length-a);count++){
     if(cfg.chainCount&&count!==cfg.chainCount)continue;
     const words=trail.slice(a,a+count);
     if(words.every(w=>w.length>=minimum&&w.length<=maximum))segments.push({theme,words});
    }
   }
  }
 }
 return segments;
}
function chooseChain(c,round){
 const candidates=chainSegments(c);if(!candidates.length)return null;
 // Select a word count first, so the shortest paths do not monopolize random games.
 const lengths=[...new Set(candidates.map(x=>x.words.length))].sort((a,b)=>a-b);
 const count=lengths[pickFor(c,lengths.length,'chain-count|'+round)];
 const options=candidates.filter(x=>x.words.length===count);
 return options[pickFor(c,options.length,'chain-path|'+round+'|'+count)];
}
function createChainRound(c,round){
 const chosen=chooseChain(c,round);if(!chosen)return null;
 const answers=chosen.words.slice(),now=Date.now();
 return {config:structuredCloneSafe(c),len:answers[1].length,answers,row:0,tries:c.attempts,typed:'',cursor:0,history:[],
  solved:answers.map((_,i)=>i===0),clues:[],hintUsed:{start:false,last:false},phase:'playing',round,selectedBoard:1,
  chainIndex:1,chainTheme:chosen.theme,chainHistory:[],runSolved:0,runFailed:0,budget:0,dailyKey:'',clockStarted:now,
  deadline:c.clock==='down'?now+c.duration*1000:null,reverseGuesses:[],initialMessage:'Start with '+answers[0].toUpperCase()+'. Each adjacent pair makes a familiar phrase.'};
}
function updateAvailability(){if(!ready)return;const c=configFromForm();if(c.mode==='chain'){const paths=chainSegments(c);$('chainAvailability').textContent=c.chainMin&&c.chainMax&&c.chainMin>c.chainMax?'Minimum letters cannot exceed maximum letters.':paths.length.toLocaleString()+' playable chain segments match these rules.'; $('startGame').disabled=!paths.length;return;}const ls=lengths(c);let n=0;for(const l of ls)n+=difficultyPool(available(c,l),c.difficulty).length;$('available').textContent=n.toLocaleString()+' eligible answers across '+ls.join(', ')+'-letter lengths. Guesses use '+dictionary.size.toLocaleString()+' dictionary words.';$('startGame').disabled=!n&&c.mode!=='reverse'&&c.mode!=='custom';$('categoryCount').textContent=selected.size?selected.size+' selected':'All topics';$('allCategories').classList.toggle('selected',!selected.size);}
function renderCategories(){const area=$('categories');area.replaceChildren();for(const [parent,subs] of Object.entries(categories)){
 const details=document.createElement('details');details.className='category-group';details.dataset.parent=parent;
 const summary=document.createElement('summary');const title=document.createElement('span');title.textContent=parent;const count=document.createElement('b');count.textContent=Object.keys(subs).length+' groups';summary.append(title,count);details.append(summary);
 const div=document.createElement('div');div.className='subcategories';
 for(const [name,words] of Object.entries(subs)){
  const key=parent+'|||'+name;const label=document.createElement('label');label.dataset.search=(parent+' '+name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const input=document.createElement('input');input.type='checkbox';input.value=key;input.checked=selected.has(key);
  input.addEventListener('change',()=>{if(input.checked)selected.add(key);else selected.delete(key);updateAvailability();$('allCategories').classList.toggle('selected',!selected.size);});
  const span=document.createElement('span');span.textContent=name;const c=document.createElement('small');c.textContent=' ('+words.length+')';c.style.color='var(--muted)';span.append(c);label.append(input,span);div.appendChild(label);
 }details.appendChild(div);area.appendChild(details);
 }}
function filterCats(){const q=$('categorySearch').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');for(const group of $('categories').querySelectorAll('.category-group')){let hits=0;const parent=group.dataset.parent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');for(const label of group.querySelectorAll('.subcategories label')){const visible=!q||label.dataset.search.includes(q);label.hidden=!visible;if(visible)hits++;}group.hidden=!hits;if(q&&hits)group.open=true;}}
function redrawChecks(){for(const input of $('categories').querySelectorAll('input[type="checkbox"]'))input.checked=selected.has(input.value);updateAvailability();}
function hash(s){let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h>>>0;}
function pickRandom(n){return Math.floor(Math.random()*n);}
function pickFor(c,n,scope){if(n<=1)return 0;return c.seedEnabled||c.runSeed?hash('wordlab-v5|'+(c.seedEnabled?c.seedValue:c.runSeed)+'|'+scope)%n:pickRandom(n);}
function dateUTC(){return new Date().toISOString().slice(0,10);}
function dayKey(c){return dateUTC()+'|'+JSON.stringify([c.selected,c.length,c.difficulty,c.repeats,c.attempts,c.hintStartEnabled,c.hintLastEnabled,c.easyLetters]);}
function chooseLength(c,round){let opts=lengths(c);if(c.mode==='progression')opts=[3,4,5,6,7,8,9].filter(n=>available(c,n).length);if(!opts.length)return null;if(c.mode==='progression'){const starting=c.length==='random'?3:Number(c.length);const target=Math.min(9,starting+Math.floor((round-1)/2));return opts.find(n=>n>=target)??opts[opts.length-1];}if(c.length!=='random')return Number(c.length);if(c.mode==='daily')return opts[hash(dateUTC()+'length|'+dayKey(c))%opts.length];return opts[pickFor(c,opts.length,'length|'+round)];}
function chooseAnswers(c,len,qty,round){let words=difficultyPool(available(c,len),c.difficulty);if(c.mode==='progression'){const d=round>=9?'expert':round>=5?'hard':c.difficulty;words=difficultyPool(available(c,len),d);}if(c.mode==='practice'&&app.missed.length){const targets=app.missed.filter(w=>words.includes(w));if(targets.length)words=targets;}
 if(!words.length)return [];
 const chosen=[];let pool=words.slice();for(let i=0;i<qty;i++){if(!pool.length)break;let idx=c.mode==='daily'?hash(dayKey(c)+'|'+i)%pool.length:pickFor(c,pool.length,'word|'+round+'|'+len+'|'+i);chosen.push(pool[idx]);pool.splice(idx,1);}return chosen;
}
function normalizedSecret(c){let s=$('secret').value.toLowerCase().trim();return /^[a-z]{3,9}$/.test(s)&&dictionary.has(s)?s:null;}
function decodeChallenge(code){try{const raw=atob(code.replace(/-/g,'+').replace(/_/g,'/'));const data=JSON.parse(raw);if(data.v!==1||!/^[a-z]{3,9}$/.test(data.secret)||!dictionary.has(data.secret))throw Error('Invalid secret');return data;}catch(err){return null;}}
function challengeValue(secret,len=secret.length){const c=configFromForm();const o={v:1,secret,attempts:c.attempts,hintStartEnabled:c.hintStartEnabled,hintLastEnabled:c.hintLastEnabled,hardRules:c.hardRules};return btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function message(t,kind='info'){$('message').textContent=t;$('message').dataset.kind=kind;}
function newRound(c,round,runState=null,forcedWord=null){
 if(c.mode==='chain')return createChainRound(c,round);
 const len=forcedWord?.length||chooseLength(c,round);if(!len)return null;
 let answers=forcedWord?[forcedWord]:chooseAnswers(c,len,c.mode==='multi'?c.multiCount:1,round);
 if(!answers.length)return null;
 let tries=c.attempts;
 if(c.mode==='multi')tries=Math.min(30,c.attempts+(answers.length-1)*2);
 if(c.mode==='survival'&&c.survivalType==='shared')tries=Math.min(tries,runState?.budget??c.attempts*2);
 let a={config:structuredCloneSafe(c),len,answers,row:0,tries,typed:'',cursor:0,history:[],solved:answers.map(()=>false),clues:[],hintUsed:{start:false,last:false},phase:'playing',round,selectedBoard:0,runSolved:runState?.solved||0,runFailed:runState?.failed||0,budget:runState?.budget??c.attempts*2,dailyKey:c.mode==='daily'?dayKey(c):'',clockStarted:runState?.clockStarted||Date.now(),deadline:runState?.deadline||(c.clock==='down'?Date.now()+c.duration*1000:null),reverseGuesses:[],initialMessage:''};
 if(c.mode==='speedrun')a.deadline=runState?.deadline||Date.now()+c.duration*1000;
 if(c.difficulty==='easy'&&c.easyLetters){const positions=[...Array(len).keys()];let h=hash(answers[0]+'|free|'+round);for(let i=positions.length-1;i>0;i--){const j=h%(i+1);[positions[i],positions[j]]=[positions[j],positions[i]];h=Math.imul(h^i,16777619)>>>0;}for(const position of positions.slice(0,Math.min(len,c.easyLetters)))a.clues.push({board:0,pos:position,char:answers[0][position],kind:'Free'});}
 return a;
}
function startGame(){if(!ready)return;const c=configFromForm();if(c.seedEnabled&&!c.seedValue){message('Enter a seed value, or uncheck Seed.','error');$('seedValue').focus();return;}if(c.mode==='chain'&&!chainSegments(c).length){message('No phrase chains match these limits. Widen the letter range or select Random words.','error');return;}if(c.mode!=='chain'&&!lengths(c).length&&c.mode!=='custom'&&c.mode!=='reverse'){message('No answers match these settings. Choose a different category, length, or repeated-letter rule.','error');return;}
 let forced=null;if(c.mode==='reverse'||c.mode==='custom'){
  const code=$('challengeImport').value.trim();if(code&&c.mode==='custom'){const data=decodeChallenge(code);if(!data){message('Invalid challenge code.','error');return;}forced=data.secret;c.attempts=data.attempts;c.hintStartEnabled=!!data.hintStartEnabled;c.hintLastEnabled=!!data.hintLastEnabled;c.hardRules=!!data.hardRules;c.length=String(forced.length);}
  else{forced=normalizedSecret(c);if(!forced){message('Enter a real dictionary word containing 3–9 letters.','error');return;}c.length=String(forced.length);}
 }
 if(!c.seedEnabled&&c.mode!=='daily'&&c.mode!=='custom'&&c.mode!=='reverse')c.runSeed=newSeed();
 sessionConfig=c;app.settings=c;
 if(c.mode==='daily'&&app.daily[dayKey(c)]){active=structuredCloneSafe(app.daily[dayKey(c)]);}
 else active=newRound(c,1,null,forced);
 if(!active){message('No eligible answers. Adjust your settings.','error');return;}
 if(c.mode==='speedrun')active.config.clock='down';
 if(c.mode==='reverse')active.initialMessage='The computer is ready. Press Computer guess.';
 save();renderGame();startTicker();$('playArea').scrollIntoView({behavior:'smooth',block:'start'});
}
function markGuess(guess,answer){const m=Array(guess.length).fill('absent'),left={};for(let i=0;i<guess.length;i++){if(guess[i]===answer[i])m[i]='correct';else left[answer[i]]=(left[answer[i]]||0)+1;}for(let i=0;i<guess.length;i++)if(m[i]!=='correct'&&(left[guess[i]]||0)>0){m[i]='present';left[guess[i]]--;}return m;}
function strictCheck(guess){if(!active.config.hardRules)return '';const fixed=Array(active.len).fill(null),wrongPlace=Array.from({length:active.len},()=>new Set()),required={};for(const row of active.history){if(!row.scores[active.selectedBoard])continue;const hits={};row.scores[active.selectedBoard].forEach((mark,i)=>{const c=row.guess[i];if(mark==='correct')fixed[i]=c;else if(mark==='present')wrongPlace[i].add(c);if(mark!=='absent')hits[c]=(hits[c]||0)+1;});for(const [c,num] of Object.entries(hits))required[c]=Math.max(required[c]||0,num);}for(const clue of active.clues)if(clue.board===active.selectedBoard)fixed[clue.pos]=clue.char;
 for(let i=0;i<guess.length;i++){if(fixed[i]&&guess[i]!==fixed[i])return 'Strict mode: '+fixed[i].toUpperCase()+' must be in position '+(i+1)+'.';if(wrongPlace[i].has(guess[i]))return 'Strict mode: move '+guess[i].toUpperCase()+' out of position '+(i+1)+'.';}
 for(const [ch,min] of Object.entries(required)){if([...guess].filter(c=>c===ch).length<min)return 'Strict mode: include '+min+' × '+ch.toUpperCase()+'.';}return '';
}
function moveCursor(position){
 if(!active||active.phase!=='playing'||active.config.mode==='reverse')return;
 active.cursor=Math.max(0,Math.min(active.len,position));save();renderBoards();
}
function addLetter(letter){
 if(!active||active.phase!=='playing'||active.config.mode==='reverse'||active.deadline&&Date.now()>=active.deadline||validating)return;
 const ch=letter.toLowerCase();if(!/^[a-z]$/.test(ch))return;
 const cursor=Math.max(0,Math.min(active.len,active.cursor??active.typed.length));
 if(cursor>=active.len)return;
 active.typed=active.typed.slice(0,cursor)+ch+active.typed.slice(cursor+1);
 active.cursor=Math.min(active.len,cursor+1);
 save();renderBoards();message(active.typed.length===active.len?'Press ENTER to submit, or edit any letter first.':`${active.len-active.typed.length} letters remaining.`, 'info');
}
function editLetter(which){
 if(!active||active.phase!=='playing'||active.config.mode==='reverse'||validating)return;
 const cursor=Math.max(0,Math.min(active.len,active.cursor??active.typed.length));
 if(which==='Backspace'&&cursor>0){active.typed=active.typed.slice(0,cursor-1)+active.typed.slice(cursor);active.cursor=cursor-1;}
 else if(which==='Delete'&&cursor<active.typed.length){active.typed=active.typed.slice(0,cursor)+active.typed.slice(cursor+1);active.cursor=cursor;}
 else if(which==='ArrowLeft')active.cursor=Math.max(0,cursor-1);
 else if(which==='ArrowRight')active.cursor=Math.min(active.len,cursor+1);
 save();renderBoards();
}

async function submit(){if(!active||active.phase!=='playing'||active.config.mode==='reverse'||validating)return;
 if(active.typed.length!==active.len){message(`Enter all ${active.len} letters before submitting.`,'error');return;}
 const guess=active.typed.toLowerCase(),roundRef=active;
 if(!dictionary.has(guess)){
  validating=true;message('Checking extended dictionary…','info');
  const valid=await lookupWord(guess);
  validating=false;
  if(active!==roundRef||active.phase!=='playing'||active.typed!==guess)return;
  if(!valid){message('Not recognized in the available dictionary. Edit this guess and try again; no attempt used.','error');return;}
 }
 const invalid=strictCheck(guess);if(invalid){message(invalid+' Edit your guess and resubmit; no attempt used.','error');return;}

 if(active.config.mode==='chain'){
  const index=active.chainIndex,answer=active.answers[index],scores=active.answers.map((_,i)=>i===index?markGuess(guess,answer):null);
  active.history.push({guess,scores});active.row++;active.typed='';active.cursor=0;
  if(guess===answer){
   active.solved[index]=true;active.chainHistory.push({index,guesses:active.history.map(x=>({guess:x.guess,scores:x.scores})),tries:active.row});
   if(index===active.answers.length-1){completeRound(true);}
   else{active.chainIndex++;active.selectedBoard=active.chainIndex;active.len=active.answers[active.chainIndex].length;active.history=[];active.row=0;
    active.clues=[];active.hintUsed={start:false,last:false};active.tries=active.config.attempts;
    active.initialMessage='Connected: '+active.answers[index-1].toUpperCase()+' + '+answer.toUpperCase()+'. Now solve word '+(active.chainIndex+1)+'.';}
  }else if(active.row>=active.tries){completeRound(false);}
  else message('Link '+(index+1)+' of '+active.answers.length+' · guess '+(active.row+1)+' of '+active.tries+'.');
  save();renderGame();return;
 }
 const scores=active.answers.map((word,i)=>active.solved[i]?null:markGuess(guess,word));
 active.history.push({guess,scores});active.row++;active.typed='';active.cursor=0;scores.forEach((result,i)=>{if(result&&result.every(mark=>mark==='correct'))active.solved[i]=true;});
 if(active.config.mode==='survival'&&active.config.survivalType==='shared')active.budget=Math.max(0,active.budget-1);
 const won=active.solved.every(Boolean);
 if(won){completeRound(true);}else if(active.row>=active.tries||(active.config.mode==='survival'&&active.config.survivalType==='shared'&&active.budget===0)){completeRound(false);}else message(`Guess ${active.row+1} of ${active.tries}.`);
 save();renderGame();
}
function updateStats(won){const s=app.stats;s.played++;if(won){s.wins++;s.streak++;s.bestStreak=Math.max(s.bestStreak,s.streak);s.totalWinGuesses+=active.config.mode==='chain'?active.chainHistory.reduce((n,x)=>n+x.tries,0):active.row;s.solvedWords+=active.solved.filter(Boolean).length-(active.config.mode==='chain'?1:0);}else{s.streak=0;s.solvedWords+=active.solved.filter(Boolean).length-(active.config.mode==='chain'?1:0);for(let i=0;i<active.answers.length;i++)if(!active.solved[i]&&(active.config.mode!=='chain'||i===active.chainIndex)&&!app.missed.includes(active.answers[i]))app.missed.unshift(active.answers[i]);app.missed=app.missed.slice(0,120);}const text=active.config.mode==='reverse'?'Computer':active.answers.join(' / ');app.recent.unshift({text,won,tries:active.row,mode:active.config.mode,date:new Date().toISOString()});app.recent=app.recent.slice(0,80);}
function completeRound(won){if(!active||active.phase!=='playing')return;updateStats(won);if(won)active.runSolved++;else active.runFailed++;active.finishedAt=Date.now();
 const mode=active.config.mode;
 if(mode==='chain'){active.phase=won?'won':'lost';message(won?'Chain complete! '+active.answers.join(' → ').toUpperCase():'Chain stopped at '+active.answers[active.chainIndex].toUpperCase()+'. Full chain: '+active.answers.join(' → ').toUpperCase(),won?'success':'error');}
 else if(mode==='speedrun'&&active.deadline&&Date.now()<active.deadline){active.phase='intermission';message(won?`Solved! ${active.runSolved} words completed. Keep going!`:`Answer: ${active.answers.join(' / ').toUpperCase()}. Keep racing.`,won?'success':'error');}
 else if(mode==='survival'){if(won){if(active.config.survivalType==='shared'){active.budget=Math.min(active.config.attempts*2,active.budget+4);}active.phase='intermission';message(`Survived! ${active.runSolved} solved. ${active.config.survivalType==='shared'?active.budget+' guesses in the bank.':'Next word is ready.'}`,'success');}else{active.phase='lost';message(`Run ended after ${active.runSolved} words. Answer: ${active.answers.join(', ').toUpperCase()}.`,'error');}}
 else if(mode==='progression'){active.phase=won?'intermission':'lost';message(won?`Level complete! ${active.runSolved} solved. Difficulty increases as you progress.`:`Progression ended after ${active.runSolved} solves. Answer: ${active.answers.join(', ').toUpperCase()}.`,won?'success':'error');}
 else if(mode==='unlimited'||mode==='practice'){active.phase='intermission';message(won?`Correct! ${active.answers.join(', ').toUpperCase()} · ${active.row} guesses.`:`The word was ${active.answers.join(', ').toUpperCase()}.`,won?'success':'error');}
 else{active.phase=won?'won':'lost';message(won?`Correct! Solved in ${active.row} guesses.`:`Out of attempts. ${active.answers.length===1?'The answer was':'Answers:'} ${active.answers.join(' / ').toUpperCase()}.`,won?'success':'error');}
}
function goNext(){if(!active)return;const mode=active.config.mode;if(mode==='reverse'&&active.phase==='playing'){computerGuess();return;}
 if(active.phase==='playing'){if(mode==='unlimited'||mode==='practice'||mode==='speedrun'){ // Skip current word is a loss.
 completeRound(false);
 }else return;}
 if(['classic','daily','multi','blind','custom','reverse'].includes(mode))return;
 if(mode==='survival'&&active.phase==='lost'||mode==='progression'&&active.phase==='lost'||active.phase==='timeout')return;
 const runState={solved:active.runSolved,failed:active.runFailed,budget:active.budget,clockStarted:(['speedrun','survival','progression'].includes(mode)?active.clockStarted:null),deadline:(['speedrun','survival','progression'].includes(mode)?active.deadline:null)};
 const newOne=newRound(active.config,active.round+1,runState);if(!newOne){message('No eligible next word. Change settings to continue.','error');return;}active=newOne;save();renderGame();startTicker();}
function showHint(which){if(!active||active.phase!=='playing'||active.hintUsed[which])return;const cfg=active.config;if(which==='start'&&!cfg.hintStartEnabled)return;if(which==='last'&&(!cfg.hintLastEnabled||active.row!==active.tries-1))return;let target=active.selectedBoard;if(active.solved[target])target=active.solved.findIndex(x=>!x);if(target<0)return;
 const known=Array(active.len).fill(false);for(const clue of active.clues)if(clue.board===target)known[clue.pos]=true;for(const row of active.history){const marks=row.scores[target];if(marks)for(let i=0;i<marks.length;i++)if(marks[i]==='correct')known[i]=true;}
 const unknown=known.map((v,i)=>v?-1:i).filter(i=>i>=0);
 active.hintUsed[which]=true;
 let report='You already know every letter position. No new clue available.';if(unknown.length){const pos=unknown[hash(active.answers[target]+'|'+which+'|'+active.row)%unknown.length];active.clues.push({board:target,pos,char:active.answers[target][pos],kind:which==='start'?'Anytime hint':'Final-try hint'});report=`Hint: letter ${pos+1} is ${active.answers[target][pos].toUpperCase()}.`;}save();renderGame();message(report,unknown.length?'success':'info');}
function computerGuess(){if(!active||active.config.mode!=='reverse'||active.phase!=='playing')return;
 const word=active.answers[0];const past=active.history;let options=dictionaryArray(active.len);
 for(const row of past){const marks=row.scores[0];options=options.filter(w=>markGuess(row.guess,w).join('')===marks.join(''));}
 if(!options.length){message('The solver ran out of candidates.','error');active.phase='lost';save();renderGame();return;}
 let guess;if(options.length===1)guess=options[0];else{
  const counts={};const sample=options.length>12000?options.filter((_,i)=>i%2===0):options;for(const w of sample){const seen=new Set(w);for(const ch of seen)counts[ch]=(counts[ch]||0)+1;}
  const favorites=available(active.config,active.len);
  const optionSet=new Set(options);const candidates=options.length>500?favorites.filter(w=>optionSet.has(w)):options;
  const choosing=candidates.length?candidates:options;
  let best=-Infinity;guess=choosing[0];for(const w of choosing){let sc=0;const seen=new Set();for(const ch of w){sc+=counts[ch]||0;if(seen.has(ch))sc-=counts[ch]||0;seen.add(ch);}sc-=toughness(w)*.005;if(sc>best){best=sc;guess=w;}}
 }
 active.typed=guess;const scores=[markGuess(guess,word)];active.history.push({guess,scores});active.row++;active.typed='';active.cursor=0;if(guess===word){active.solved[0]=true;completeRound(true);}else if(active.row>=active.tries)completeRound(false);else message(`Computer guessed ${guess.toUpperCase()}. ${active.tries-active.row} attempts remain.`);save();renderGame();}
let byLength=new Map();function dictionaryArray(n){if(!byLength.has(n))byLength.set(n,[...dictionary].filter(w=>w.length===n));return byLength.get(n);}
function renderChainBoards(){
 const outer=$('boards');outer.replaceChildren();outer.classList.remove('multi');outer.style.gridTemplateColumns='';
 const stack=document.createElement('div');stack.className='chain-stack';
 for(let idx=0;idx<active.answers.length;idx++){
  const word=active.answers[idx],current=idx===active.chainIndex&&active.phase!=='won';
  const item=document.createElement('section');item.className='chain-item'+(active.solved[idx]?' chain-solved':current?' chain-current':' chain-hidden');
  const head=document.createElement('div');head.className='chain-item-head';
  const ordinal=document.createElement('span');ordinal.textContent='LINK '+String(idx+1).padStart(2,'0');
  const status=document.createElement('span');status.textContent=active.solved[idx]?(idx===0?'STARTER':'✓ COMPLETE'):current?'NOW GUESSING · '+word.length+' LETTERS':word.length+' LETTERS';
  head.append(ordinal,status);item.append(head);
  if(active.solved[idx]){
   const solved=document.createElement('div');solved.className='chain-word';solved.textContent=word.toUpperCase();
   item.append(solved);
   if(idx>0){const phrase=document.createElement('div');phrase.className='chain-link-label';phrase.textContent=active.answers[idx-1].toUpperCase()+' + '+word.toUpperCase();item.append(phrase);}
  }else{
   const board=document.createElement('div');board.className='tile-board';board.style.setProperty('--cols',String(word.length));
   const rows=current?active.tries:1;
   for(let r=0;r<rows;r++){
    const row=document.createElement('div');row.className='tile-row';const past=current?active.history[r]:null;
    for(let j=0;j<word.length;j++){
     const tile=document.createElement('span');tile.className='tile';let ch='',mark='';
     if(past){ch=past.guess[j].toUpperCase();mark=past.scores[idx]?.[j]||'';}
     else if(current&&r===active.row&&active.phase==='playing'){
      ch=(active.typed[j]||'').toUpperCase();if(ch)mark='typed';
      if(j===(active.cursor??active.typed.length))tile.classList.add('caret');
      tile.dataset.position=String(j);tile.addEventListener('click',evt=>{evt.stopPropagation();moveCursor(j);outer.focus({preventScroll:true});});
     }
     if(mark)tile.classList.add(mark);tile.textContent=ch;
     if(current&&r===active.row&&!ch&&active.clues.some(h=>h.board===idx&&h.pos===j))tile.classList.add('revealed');
     tile.setAttribute('aria-label',current?(ch?ch+' '+mark:'Empty tile'):'Hidden '+word.length+' letter word');row.append(tile);
    }board.append(row);
   }
   item.append(board);
   if(current&&idx>0){const link=document.createElement('p');link.className='chain-prompt';link.textContent=active.answers[idx-1].toUpperCase()+' + ?';item.insertBefore(link,board);}
  }
  stack.append(item);
 }
 outer.append(stack);
}
function boardElement(word,index){const wrap=document.createElement('div');wrap.className='board-group'+(active.selectedBoard===index?' chosen':'');const isMulti=active.answers.length>1;const caption=document.createElement('div');caption.className='board-caption';const name=document.createElement('span');name.textContent=isMulti?'WORD '+(index+1):`${active.len} LETTERS · ${active.config.difficulty.toUpperCase()}`;const status=document.createElement('b');status.textContent=active.solved[index]?'SOLVED':active.phase==='lost'||active.phase==='timeout'?'REVEALED':isMulti?'TAP FOR HINT':'';caption.append(name,status);wrap.append(caption);
 const board=document.createElement('div');board.className='tile-board';board.style.setProperty('--cols',String(active.len));
 const visibleRows=Math.min(active.tries,active.answers.length>1?active.tries:20);
 for(let r=0;r<visibleRows;r++){const row=document.createElement('div');row.className='tile-row';const past=active.history[r];for(let j=0;j<active.len;j++){
  const tile=document.createElement('span');tile.className='tile';let ch='',mark='';if(past){if(past.scores[index]){ch=past.guess[j].toUpperCase();mark=past.scores[index][j];}else{tile.classList.add('mute');}}
  else if(r===active.row&&active.phase==='playing'&&active.config.mode!=='reverse'){ch=(active.typed[j]||'').toUpperCase();if(ch)mark='typed';if(j===(active.cursor??active.typed.length))tile.classList.add('caret');tile.dataset.position=String(j);tile.addEventListener('click',event=>{event.stopPropagation();if(active.answers.length>1)active.selectedBoard=index;moveCursor(j);$('boards').focus({preventScroll:true});});}
  if(mark)tile.classList.add(mark);tile.textContent=ch;
  const known=active.clues.find(x=>x.board===index&&x.pos===j);if(known&&r===active.row&&!ch)tile.classList.add('revealed');
  tile.setAttribute('aria-label',ch?ch+(mark?': '+mark:''):'Empty');row.appendChild(tile);
 }board.append(row);}
 wrap.append(board);if(isMulti){wrap.addEventListener('click',()=>{active.selectedBoard=index;save();renderGame();});wrap.style.cursor='pointer';}
 return wrap;}
function renderBoards(){if(!active)return;if(active.config.mode==='chain'){renderChainBoards();return;}const el=$('boards');el.replaceChildren();el.classList.toggle('multi',active.answers.length>1);el.dataset.count=String(active.answers.length);for(let i=0;i<active.answers.length;i++)el.append(boardElement(active.answers[i],i));if(active.answers.length===8&&window.innerWidth<700){el.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';}else el.style.gridTemplateColumns='';}
function keyboard(){const area=$('keyboard');area.replaceChildren();for(const line of ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']){const row=document.createElement('div');row.className='keyrow';let keys=line.split('');if(line.startsWith('Z'))keys=['ENTER',...keys,'⌫'];for(const key of keys){const button=document.createElement('button');button.type='button';button.className='key'+(key==='ENTER'||key==='⌫'?' special':'');button.textContent=key;button.dataset.letter=key.toLowerCase();button.addEventListener('click',()=>{if(key==='ENTER')submit();else if(key==='⌫')editLetter('Backspace');else addLetter(key);$('boards').focus({preventScroll:true});});row.append(button);}area.append(row);}paintKeyboard();}
function paintKeyboard(){const state={};if(active)for(const row of active.history)for(const marks of row.scores){if(!marks)continue;marks.forEach((m,i)=>{const c=row.guess[i];if((state[c]||0)<({absent:1,present:2,correct:3}[m]))state[c]={absent:1,present:2,correct:3}[m];});}const reverse={1:'absent',2:'present',3:'correct'};for(const b of $('keyboard').querySelectorAll('.key')){b.classList.remove('absent','present','correct');if(active?.config.mode!=='blind'&&active?.config.mode!=='reverse'&&state[b.dataset.letter])b.classList.add(reverse[state[b.dataset.letter]]);}}
function renderStats(){const s=app.stats;$('statPlayed').textContent=String(s.played);$('statWins').textContent=s.played?Math.round(100*s.wins/s.played)+'%':'0%';$('statAverage').textContent=s.wins?(s.totalWinGuesses/s.wins).toFixed(2):'—';$('statStreak').textContent=String(s.bestStreak);$('streakMetric').textContent=String(s.bestStreak);$('historyCount').textContent=app.recent.length+' recorded';$('history').replaceChildren();if(!app.recent.length){const span=document.createElement('span');span.className='muted';span.textContent='No completed games yet.';$('history').append(span);}for(const x of app.recent.slice(0,14)){const badge=document.createElement('span');badge.className='history-chip '+(x.won?'win':'loss');badge.textContent=(x.won?'✓ ':'× ')+x.text.toUpperCase()+' · '+x.tries+' guesses';$('history').append(badge);}}
function renderGame(){if(!active)return;const c=active.config;const desc=MODE_INFO[c.mode];$('modeLabel').textContent=c.mode==='chain'?'CHAIN REACTION · PHRASE MODE':desc[0]+' · '+c.difficulty.toUpperCase();$('gameTitle').textContent=c.mode==='chain'?'Link the words.':c.mode==='reverse'?'Beat the computer.':c.mode==='speedrun'?'Beat the clock.':c.mode==='survival'?'How long can you last?':c.mode==='multi'?'One guess. Many words.':'Find the hidden word.';$('gameSubtitle').textContent=c.mode==='chain'?'Theme: '+active.chainTheme+' · '+active.answers.length+' connected words':c.mode==='daily'?'Puzzle date: '+dateUTC()+' UTC · same settings, same word':desc[1];$('roundLabel').textContent=c.mode==='chain'?'LINK '+Math.min(active.chainIndex+1,active.answers.length)+' / '+active.answers.length:'ROUND '+String(active.round).padStart(2,'0');$('attemptMetric').textContent=active.row+' / '+active.tries;$('solvedMetric').textContent=String(c.mode==='chain'?active.solved.filter(Boolean).length-1:active.runSolved);$('clockLabel').textContent=c.clock==='off'?'LENGTH':'TIME';renderClock();
 if(!$('keyboard').children.length)keyboard();
 const copySeed=$('copyRunSeed');copySeed.hidden=active.phase==='playing'||!((c.seedEnabled&&c.seedValue)||c.runSeed);
 const next=$('primaryAction');if(c.mode==='reverse'){next.textContent='Computer guess ↗';next.disabled=active.phase!=='playing';}else if(c.mode==='chain'&&active.phase==='playing'){next.textContent='Complete the chain to continue';next.disabled=true;}else if(active.phase==='intermission'){next.textContent=c.mode==='speedrun'?'Next word ↗':c.mode==='survival'?'Continue run ↗':c.mode==='progression'?'Next level ↗':'Next word ↗';next.disabled=false;}else if(c.mode==='chain'&&active.phase!=='playing'){next.textContent='New chain ↗';next.disabled=false;}else if(active.phase==='playing'&&['unlimited','practice','speedrun'].includes(c.mode)){next.textContent='Skip word ↗';next.disabled=false;}else{next.textContent='Game finished';next.disabled=true;}
 $('startHint').disabled=active.phase!=='playing'||!c.hintStartEnabled||active.hintUsed.start||c.mode==='reverse';$('lastHint').disabled=active.phase!=='playing'||!c.hintLastEnabled||active.row!==active.tries-1||active.hintUsed.last||c.mode==='reverse';$('hintInfo').textContent=c.mode==='chain'?'Each linked word gets its own optional hints':c.mode==='reverse'?'No hints in reverse mode':c.mode==='multi'?'Tap a board to choose hint target':active.phase==='playing'?'An anytime hint and a final-try hint each reveal one position':'Puzzle complete';
 $('clues').replaceChildren();for(const hint of active.clues){const el=document.createElement('span');el.className='clue';el.textContent=(active.answers.length>1?'Word '+(hint.board+1)+' · ':'')+'#'+(hint.pos+1)+' = '+hint.char.toUpperCase()+' · '+hint.kind;$('clues').append(el);}
 renderBoards();paintKeyboard();renderStats();if(active.initialMessage){message(active.initialMessage);active.initialMessage='';}else if(active.phase==='playing'){message(c.mode==='chain'?`Link ${active.chainIndex+1} of ${active.answers.length} · guess ${active.row+1} of ${active.tries}.` : c.mode==='reverse'?'Press Computer guess to see the next attempt.':`Guess ${active.row+1} of ${active.tries} · ${active.len} letters. Edit until you press Enter.`);}
 else if(active.phase==='won'||active.phase==='lost'){message((active.phase==='won'?'Solved! ':'Answer: ')+active.answers.join(' / ').toUpperCase(),active.phase==='won'?'success':'error');}
 else if(active.phase==='timeout'){message('Time is up! '+active.runSolved+' words solved.','error');}
 keyboardEnabled();}
function keyboardEnabled(){const disabled=!active||active.phase!=='playing'||active.config.mode==='reverse';$('keyboard').querySelectorAll('.key').forEach(b=>b.disabled=disabled);}
function renderClock(){if(!active)return;const c=active.config;if(c.clock==='off'){$('clockMetric').textContent=active.len+' letters';return;}const live=active.phase==='playing'||['speedrun','survival','progression'].includes(c.mode)&&active.phase==='intermission';const now=live?Date.now():(active.finishedAt||Date.now()),ms=c.clock==='down'?Math.max(0,(active.deadline||now)-now):Math.max(0,now-active.clockStarted),sec=Math.floor(ms/1000);$('clockMetric').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
function startTicker(){if(ticker)clearInterval(ticker);ticker=setInterval(()=>{if(!active)return;renderClock();if(active.config.clock==='down'&&active.deadline&&Date.now()>=active.deadline&&(active.phase==='playing'||['speedrun','survival','progression'].includes(active.config.mode)&&active.phase==='intermission')){const mode=active.config.mode;if(active.phase==='playing'){updateStats(false);active.runFailed++;}active.phase='timeout';message('Time is up! '+active.runSolved+' words solved.','error');save();renderGame();}},300);}
async function exportProgress(){const blob=new Blob([JSON.stringify({...app,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='wordlab-progress-'+dateUTC()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importProgress(file){if(!file)return;try{const raw=JSON.parse(await file.text());if(!raw?.stats||!Array.isArray(raw.recent)||!raw.stats.played&&!raw.active&&!raw.settings)throw Error('Invalid format');const safe=BASE_SAVE();safe.stats={...safe.stats,...raw.stats};for(const key of Object.keys(safe.stats))safe.stats[key]=Math.max(0,Number(safe.stats[key])||0);safe.recent=raw.recent.slice(0,80).filter(x=>x&&typeof x.text==='string'&&x.text.length<100);safe.missed=(raw.missed||[]).filter(w=>typeof w==='string'&&dictionary.has(w)).slice(0,120);safe.daily={};safe.customWords=raw.customWords&&typeof raw.customWords==='object'?raw.customWords:{};safe.settings=raw.settings||null;safe.active=null;app=safe;active=null;mergeCustomWords();if(safe.settings){restoreForm(safe.settings);renderCategories();setupConditional();}save();startGame();message('Progress imported. Active puzzle restarted; statistics restored.','success');}catch(e){message('Could not import progress: invalid or incompatible JSON.','error');}finally{$('importData').value='';}}
function makeCode(){const secret=normalizedSecret(configFromForm());if(!secret){message('Enter a valid 3–9 letter dictionary word first.','error');return;}const code=challengeValue(secret);$('challengeOutput').hidden=false;$('challengeCode').value=code;message('Challenge code ready. Anyone with the code can import the puzzle.','success');}
async function copyCode(){const code=$('challengeCode').value;if(!code)return;try{await navigator.clipboard.writeText(code);message('Challenge code copied.','success');}catch(e){$('challengeCode').focus();$('challengeCode').select();message('Select and copy the highlighted challenge code.','info');}}
function loadChallenge(){const data=decodeChallenge($('challengeImport').value.trim());if(!data){message('Not a valid challenge code.','error');return;}$('mode').value='custom';$('secret').value=data.secret;$('length').value=String(data.secret.length);$('attempts').value=String(data.attempts);$('hintStartEnabled').checked=data.hintStartEnabled;$('hintLastEnabled').checked=data.hintLastEnabled;$('hardRules').checked=data.hardRules;setupConditional();message('Challenge loaded. Click Build & Play to begin.','success');}

function mergeCustomWords(){
 if(!app.customWords||typeof app.customWords!=='object')app.customWords={};
 for(const [key,words] of Object.entries(app.customWords)){
  const [parent,sub]=key.split('|||');if(!categories[parent]||!Array.isArray(categories[parent][sub])||!Array.isArray(words))continue;
  for(const raw of words.slice(0,5000)){const word=String(raw).toLowerCase();if(!/^[a-z]{3,9}$/.test(word))continue;
   if(!categories[parent][sub].includes(word))categories[parent][sub].push(word);
   dictionary.add(word);
  }
 }
 allAnswers=[...new Set(Object.values(categories).flatMap(gr=>Object.values(gr).flat()))];
 for(const w of allAnswers)dictionary.add(w);
}
function populateWordCategories(){
 const category=$('newWordCategory');category.replaceChildren();for(const name of Object.keys(categories).sort()){const option=new Option(name,name);category.add(option);}populateWordSubcategories();
}
function populateWordSubcategories(){
 const sub=$('newWordSubcategory');sub.replaceChildren();for(const name of Object.keys(categories[$('newWordCategory').value]||{}).sort())sub.add(new Option(name,name));
}
function addCustomWord(e){
 e.preventDefault();const word=$('newWord').value.trim().toLowerCase(),parent=$('newWordCategory').value,sub=$('newWordSubcategory').value;
 if(!/^[a-z]{3,9}$/.test(word)){ $('addWordStatus').textContent='Use 3–9 English letters (A–Z).';return;}
 if(!categories[parent]||!Array.isArray(categories[parent][sub]))return;
 const exists=categories[parent][sub].includes(word),known=dictionary.has(word);
 if(!exists){const key=parent+'|||'+sub;app.customWords??={};app.customWords[key]??=[];if(!app.customWords[key].includes(word))app.customWords[key].push(word);categories[parent][sub].push(word);}
 if(!known)dictionary.add(word);
 if(!allAnswers.includes(word))allAnswers.push(word);
 save();renderCategories();filterCats();updateAvailability();
 $('addWordDialog').close();message(exists?word.toUpperCase()+' is already in '+sub+'.':word.toUpperCase()+' added to '+parent+' / '+sub+(known?'.':' and your offline dictionary.'),'success');
}
async function copyRunSeed(){
 if(!active||active.phase==='playing')return;
 const c=active.config,seed=c.seedEnabled?c.seedValue:c.runSeed;
 if(!seed)return;
 try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(seed);else{const input=document.createElement('textarea');input.value=seed;document.body.append(input);input.select();if(!document.execCommand('copy'))throw Error('Clipboard unavailable');input.remove();}message('Seed copied: '+seed,'success');}
 catch(e){message('Unable to copy automatically. Seed: '+seed,'error');}
}

// Device-only appearance preferences, separate from game progress.
const APPEARANCE_KEY='wordlab-appearance-v1';
const PALETTES={
 original:{bg:'#101a23',panel:'#16232e',ink:'#ecf1ef',accent:'#b6db71',green:'#468d6b',yellow:'#d1ac4c',gray:'#455a68'},
 ocean:{bg:'#0b1b2b',panel:'#132b42',ink:'#edf6ff',accent:'#71c7ec',green:'#268c87',yellow:'#e3b45b',gray:'#466177'},
 forest:{bg:'#101e17',panel:'#1b3225',ink:'#edf5e9',accent:'#a8da80',green:'#448e60',yellow:'#d9b455',gray:'#52675b'},
 sunset:{bg:'#251820',panel:'#382630',ink:'#fff1e8',accent:'#f6a873',green:'#c05e7e',yellow:'#edbd65',gray:'#715c6b'},
 light:{bg:'#f1f4f6',panel:'#ffffff',ink:'#172c39',accent:'#59803d',green:'#378367',yellow:'#b68a24',gray:'#778c9b'}
};
const COLOR_KEYS=['bg','panel','ink','accent','green','yellow','gray'];
let appearance={preset:'original',colors:{...PALETTES.original},size:100,motion:false};
function applyAppearance(){
 const root=document.documentElement;
 for(const key of COLOR_KEYS)root.style.setProperty('--'+key,appearance.colors[key]);
 root.style.setProperty('--wordlab-font-scale',String(appearance.size/100));
 document.body.classList.toggle('wordlab-reduced-motion',appearance.motion);
 const theme=document.querySelector('meta[name="theme-color"]');if(theme)theme.content=appearance.colors.bg;
}
function saveAppearance(){try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearance));}catch(_){}}
function restoreAppearance(){try{const data=JSON.parse(localStorage.getItem(APPEARANCE_KEY)||'null');if(data&&typeof data==='object'){
  const preset=Object.hasOwn(PALETTES,data.preset)?data.preset:'custom';
  const base=PALETTES[preset]||PALETTES.original;
  const colors={...base};for(const key of COLOR_KEYS)if(/^#[0-9a-f]{6}$/i.test(data.colors?.[key]||''))colors[key]=data.colors[key];
  appearance={preset,colors,size:[90,100,110,125].includes(data.size)?data.size:100,motion:!!data.motion};
 }}catch(_){}applyAppearance();}
function syncAppearanceForm(){
 $('appearancePreset').value=appearance.preset;
 for(const key of COLOR_KEYS)$('appearance'+key[0].toUpperCase()+key.slice(1)).value=appearance.colors[key];
 $('appearanceSize').value=String(appearance.size);$('appearanceMotion').checked=appearance.motion;
}
function setupAppearance(){
 restoreAppearance();
 $('customizeBtn').addEventListener('click',()=>{syncAppearanceForm();$('appearanceDialog').showModal();});
 for(const id of ['appearanceClose','appearanceDone'])$(id).addEventListener('click',()=>$('appearanceDialog').close());
 $('appearancePreset').addEventListener('change',e=>{const preset=e.target.value;if(PALETTES[preset]){appearance.preset=preset;appearance.colors={...PALETTES[preset]};}else appearance.preset='custom';applyAppearance();syncAppearanceForm();saveAppearance();});
 for(const key of COLOR_KEYS){$('appearance'+key[0].toUpperCase()+key.slice(1)).addEventListener('input',e=>{appearance.colors[key]=e.target.value;appearance.preset='custom';$('appearancePreset').value='custom';applyAppearance();saveAppearance();});}
 $('appearanceSize').addEventListener('change',e=>{appearance.size=Number(e.target.value);applyAppearance();saveAppearance();});
 $('appearanceMotion').addEventListener('change',e=>{appearance.motion=e.target.checked;applyAppearance();saveAppearance();});
 $('appearanceReset').addEventListener('click',()=>{appearance={preset:'original',colors:{...PALETTES.original},size:100,motion:false};applyAppearance();syncAppearanceForm();saveAppearance();});
}
function events(){for(const id of formFields)$(id).addEventListener('change',setupConditional);$('seedValue').addEventListener('input',()=>{seedError='';});$('categorySearch').addEventListener('input',filterCats);$('allCategories').addEventListener('click',()=>{selected.clear();redrawChecks();});$('clearCategories').addEventListener('click',()=>{selected.clear();$('categorySearch').value='';filterCats();for(const section of $('categories').querySelectorAll('details'))section.open=false;redrawChecks();});$('setup').addEventListener('submit',e=>{e.preventDefault();startGame();});$('startHint').addEventListener('click',()=>showHint('start'));$('lastHint').addEventListener('click',()=>showHint('last'));$('primaryAction').addEventListener('click',goNext);$('restart').addEventListener('click',()=>{if(active)startGame();});$('copyRunSeed').addEventListener('click',copyRunSeed);$('addWordOpen').addEventListener('click',()=>{$('addWordStatus').textContent='';populateWordCategories();$('addWordDialog').showModal();$('newWord').focus();});$('addWordCancel').addEventListener('click',()=>$('addWordDialog').close());$('newWordCategory').addEventListener('change',populateWordSubcategories);$('addWordForm').addEventListener('submit',addCustomWord);$('exportData').addEventListener('click',exportProgress);$('importData').addEventListener('change',e=>importProgress(e.target.files[0]));$('makeChallenge').addEventListener('click',makeCode);$('copyChallenge').addEventListener('click',copyCode);$('loadChallenge').addEventListener('click',loadChallenge);$('refreshDictionary').addEventListener('click',()=>loadOnlineDictionary(true));
 document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea,button'))return;if(['Backspace','Delete','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();editLetter(e.key);return;}if(e.key==='Enter'){e.preventDefault();submit();return;}if(/^[a-z]$/i.test(e.key)){e.preventDefault();addLetter(e.key);}});
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installBtn').hidden=false;});$('installBtn').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('installBtn').hidden=true;});window.addEventListener('appinstalled',()=>{$('installBtn').hidden=true;});
}
function onlineMessage(status){
 onlineState=status;
 $('onlineStatus').textContent=status;
 $('dictionaryCount').textContent=dictionary.size.toLocaleString()+' words available';
}
function openDictionaryDatabase(){
 if(!('indexedDB' in window))return Promise.resolve(null);
 return new Promise(resolve=>{
  try{const req=indexedDB.open('wordlab-dictionary-v1',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('lists');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);
  }catch(_){resolve(null);}
 });
}
async function dictionaryCache(readOrWrite,entry){
 const db=await openDictionaryDatabase();if(!db)return null;
 return await new Promise(resolve=>{
  try{const tx=db.transaction('lists',readOrWrite==='read'?'readonly':'readwrite');
   const req=readOrWrite==='read'?tx.objectStore('lists').get('english'):tx.objectStore('lists').put(entry,'english');
   req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();tx.onabort=()=>db.close();
  }catch(_){db.close();resolve(null);}
 });
}
function mergeWordList(text){
 let added=0;
 for(const word of text.split(/\s+/))if(/^[a-z]{3,9}$/.test(word)&&!dictionary.has(word)){dictionary.add(word);added++;}
 if(added){byLength.clear();}
 onlineCount+=added;return added;
}
async function loadOnlineDictionary(force=false){
 if(onlineBusy)return;
 onlineBusy=true;$('refreshDictionary').disabled=true;
 let cached=null;
 try{
  cached=await dictionaryCache('read');
  if(cached?.data&&typeof cached.data==='string'){
   mergeWordList(cached.data);
   onlineMessage('Extended dictionary cached · '+dictionary.size.toLocaleString()+' accepted guesses');
  }
  if(cached?.data&&!force&&Date.now()-(cached.checked||0)<ONLINE_CACHE_DAYS*86400000)return;
  if(navigator.onLine===false){onlineMessage(cached?.data?'Offline · cached expansion available':'Offline · local dictionary available');return;}
  onlineMessage('Checking online dictionary…');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),14000);
  try{
   const response=await fetch(ONLINE_SOURCE,{mode:'cors',signal:controller.signal,cache:'no-cache'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=(await response.text()).toLowerCase();
   if(data.length<100000||!data.includes('word'))throw Error('Unexpected word list');
   const count=mergeWordList(data);
   await dictionaryCache('write',{data,checked:Date.now()});
   onlineMessage('Online expansion active · '+dictionary.size.toLocaleString()+' accepted guesses ('+count.toLocaleString()+' newly added)');
  }finally{clearTimeout(timeout);}
 }catch(err){onlineMessage((cached?.data?'Cached expansion active':'Local dictionary active')+' · internet list unavailable');}
 finally{onlineBusy=false;$('refreshDictionary').disabled=false;}
}
async function lookupWord(word){
 if(dictionary.has(word))return true;
 if(navigator.onLine===false)return false;
 try{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),4500);
  try{const response=await fetch(ONLINE_LOOKUP+encodeURIComponent(word),{signal:controller.signal,mode:'cors'});
   if(!response.ok)return false;
   const data=await response.json();
   if(Array.isArray(data)&&data.some(x=>String(x.word||'').toLowerCase()===word&&Array.isArray(x.meanings)&&x.meanings.length)){
    dictionary.add(word);byLength.clear();onlineMessage('Online validation available · '+dictionary.size.toLocaleString()+' accepted guesses');return true;
   }
  }finally{clearTimeout(timeout);}
 }catch(_){ /* No connection, CORS, or no entry: retain offline behavior. */ }
 return false;
}
async function init(){setupAppearance();loadSaved();for(let i=3;i<=20;i++){const option=document.createElement('option');option.value=String(i);option.textContent=i+' guesses';if(i===6)option.selected=true;$('attempts').append(option);}restoreForm(app.settings);events();
 try{if(window.WORDLAB_EMBEDDED){categories=window.WORDLAB_EMBEDDED.categories;chains=window.WORDLAB_EMBEDDED.chains||{};dictionary=new Set(window.WORDLAB_EMBEDDED.dictionary.split(/\s+/).filter(Boolean));}else{const [catResp,dictResp,chainsResp]=await Promise.all([fetch('categories.json'),fetch('dictionary.txt'),fetch('chains.json')]);if(!catResp.ok||!dictResp.ok||!chainsResp.ok)throw Error('Data files unavailable.');categories=await catResp.json();chains=await chainsResp.json();dictionary=new Set((await dictResp.text()).split(/\s+/).filter(Boolean));}
 for(const theme of Object.keys(chains)){const option=document.createElement('option');option.value=theme;option.textContent=theme;$('chainTheme').append(option);}
 for(let n=3;n<=9;n++){for(const id of ['chainMin','chainMax']){const option=document.createElement('option');option.value=String(n);option.textContent=n+' letters';$(id).append(option);}const option=document.createElement('option');option.value=String(n);option.textContent=n+' words';$('chainCount').append(option);}
 for(const group of Object.values(chains))for(const trail of group)for(const word of trail)dictionary.add(word);
 restoreForm(app.settings);mergeCustomWords();ready=true;renderCategories();setupConditional();onlineMessage('Local dictionary ready · online expansion pending');$('dataStatus').textContent=dictionary.size.toLocaleString()+' local guesses · '+allAnswers.length.toLocaleString()+' curated possible answers · '+Object.values(categories).reduce((t,x)=>t+Object.keys(x).length,0)+' subcategories · '+Object.values(chains).reduce((n,items)=>n+items.length,0)+' curated phrase chains.';
 const prior=app.active;if(prior?.answers&&prior?.config&&prior.phase&&prior.len&&Array.isArray(prior.history)){active=prior;active.cursor=Number.isInteger(active.cursor)?active.cursor:active.typed.length;sessionConfig=active.config;const c=active.config;restoreForm(c);selected=new Set(c.selected||[]);renderCategories();setupConditional();renderGame();startTicker();}else startGame();
  loadOnlineDictionary(false);
 }catch(e){console.error(e);message('Unable to load the offline dictionary. Open this from a local web server or use the single-file version.','error');$('dataStatus').textContent='Dictionary failed to load: '+e.message;}
 if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
init();
})();
