// ============================================
// AA MD Bot - Health & Fitness Tools
// Commands: .bmi .calories .water .heartrate
//   .workout .stretch .yoga .bodyfat
// No API needed — all local
// ============================================

const WORKOUTS = [
  { name:'Full Body Blast',    list:['20 Jumping Jacks','15 Push-ups','20 Squats','30s Plank','10 Burpees','15 Lunges (each leg)','20 Crunches','10 Mountain Climbers'] },
  { name:'Core Crusher',       list:['30s Plank','20 Crunches','15 Leg Raises','20 Russian Twists','30s Side Plank (each)','15 Bicycle Crunches','10 V-Ups','20 Flutter Kicks'] },
  { name:'Cardio Fire',        list:['30 Jumping Jacks','20 High Knees','15 Burpees','20 Mountain Climbers','30s Jump Rope','15 Star Jumps','20 Speed Skaters','30s Sprint in Place'] },
  { name:'Upper Body',         list:['20 Push-ups','15 Tricep Dips','10 Diamond Push-ups','15 Arm Circles','20 Shoulder Taps','10 Pike Push-ups','15 Superman Holds','20 Punches'] },
  { name:'Lower Body',         list:['20 Squats','15 Lunges each leg','20 Calf Raises','15 Jump Squats','20 Glute Bridges','10 Single-Leg Deadlifts','30s Wall Sit','20 Step-ups'] },
];
const YOGA_POSES = [
  {name:'Mountain Pose (Tadasana)',      level:'Beginner',  desc:'Stand tall, feet together, arms at sides. Ground through your feet and breathe deeply.'},
  {name:'Downward Dog (Adho Mukha)',      level:'Beginner',  desc:'Hands and feet on floor, hips high, forming an inverted V. Hold 30–60 seconds.'},
  {name:'Warrior I (Virabhadrasana I)',   level:'Beginner',  desc:'Lunge position, back foot angled 45°, arms reaching overhead. Strong and grounded.'},
  {name:'Tree Pose (Vrksasana)',          level:'Beginner',  desc:'Stand on one leg, other foot on inner thigh. Hands at heart or overhead. Balance!'},
  {name:'Cobra Pose (Bhujangasana)',      level:'Beginner',  desc:'Lie face down, hands under shoulders, press up opening the chest toward the sky.'},
  {name:"Child's Pose (Balasana)",        level:'Beginner',  desc:'Kneel, sit on heels, fold forward with arms extended. Rest and breathe.'},
  {name:'Plank Pose (Phalakasana)',       level:'Intermediate',desc:'Push-up position, body in straight line, core tight. 30–60 seconds.'},
  {name:'Crow Pose (Bakasana)',           level:'Advanced',  desc:'Squat, hands on floor, lean forward balancing knees on triceps. Core strength required.'},
];
const FOOD_CALS = {
  apple:{cal:95,p:'0.5g',c:'25g',f:'0.3g'},banana:{cal:105,p:'1.3g',c:'27g',f:'0.4g'},
  rice:{cal:206,p:'4.3g',c:'45g',f:'0.4g'},chicken:{cal:165,p:'31g',c:'0g',f:'3.6g'},
  egg:{cal:78,p:'6g',c:'0.6g',f:'5g'},bread:{cal:79,p:'2.7g',c:'15g',f:'1g'},
  milk:{cal:149,p:'8g',c:'12g',f:'8g'},potato:{cal:161,p:'4.3g',c:'37g',f:'0.2g'},
  pasta:{cal:220,p:'8g',c:'43g',f:'1.3g'},fish:{cal:136,p:'25g',c:'0g',f:'3.5g'},
  beef:{cal:250,p:'26g',c:'0g',f:'15g'},pizza:{cal:285,p:'12g',c:'36g',f:'10g'},
  burger:{cal:354,p:'20g',c:'29g',f:'17g'},salad:{cal:20,p:'1.8g',c:'3.3g',f:'0.2g'},
  avocado:{cal:240,p:'3g',c:'13g',f:'22g'},orange:{cal:62,p:'1.2g',c:'15g',f:'0.2g'},
  mango:{cal:99,p:'1.4g',c:'25g',f:'0.6g'},watermelon:{cal:46,p:'0.9g',c:'12g',f:'0.2g'},
  peanuts:{cal:567,p:'26g',c:'16g',f:'49g'},yogurt:{cal:100,p:'17g',c:'6g',f:'0.7g'},
};

export default {
  command: 'bmi',
  alias: ['bmicalc', 'calories', 'calorie', 'water', 'hydration', 'heartrate', 'hr', 'maxhr', 'workout', 'wod', 'exercise', 'stretch', 'yoga', 'yogapose', 'bodyfat', 'bfp'],
  description: 'Health & fitness — BMI, calories, water, heart rate, workouts, yoga',
  category: 'tools',

  async execute({ command, args, text, reply, prefix }) {

    // ── BMI ────────────────────────────────────────────
    if (['bmi','bmicalc'].includes(command)) {
      const weight = parseFloat(args[0]), height = parseFloat(args[1]);
      if (!weight || !height) return reply(
        `⚖️ *BMI Calculator*\n\n${prefix}bmi <weight_kg> <height_cm>\n${prefix}bmi 70 175`
      );
      const h = height / 100;
      const bmi = weight / (h * h);
      const cat = bmi < 18.5 ? '🔵 Underweight' : bmi < 25 ? '🟢 Normal' : bmi < 30 ? '🟡 Overweight' : '🔴 Obese';
      return reply(
        `⚖️ *BMI Calculator*\n\n` +
        `Weight: ${weight}kg  •  Height: ${height}cm\n\n` +
        `BMI: *${bmi.toFixed(1)}*  —  ${cat}\n\n` +
        `📊 *Ranges:*\n` +
        `< 18.5 — Underweight\n18.5–24.9 — Normal ✅\n25–29.9 — Overweight\n≥ 30 — Obese\n\n` +
        `> ❤️ *AA MD Bot*`
      );
    }

    // ── calories (food lookup) ─────────────────────────
    if (['calories','calorie','food'].includes(command)) {
      const q = (args[0]||'').toLowerCase();
      if (!q) return reply(
        `🍽️ *Calorie Lookup*\n\n${prefix}calories <food>\n\n*Available:*\n${Object.keys(FOOD_CALS).join(', ')}\n\n> ❤️ *AA MD Bot*`
      );
      const f = FOOD_CALS[q];
      if (!f) return reply(`❌ Food not found: _${q}_\n\n*Available:* ${Object.keys(FOOD_CALS).join(', ')}`);
      return reply(
        `🍽️ *${q.charAt(0).toUpperCase()+q.slice(1)}* (per serving)\n\n` +
        `🔥 Calories: *${f.cal} kcal*\n` +
        `💪 Protein: *${f.p}*\n` +
        `🍞 Carbs: *${f.c}*\n` +
        `🧈 Fat: *${f.f}*\n\n> ❤️ *AA MD Bot*`
      );
    }

    // ── water intake ───────────────────────────────────
    if (['water','hydration'].includes(command)) {
      const weight = parseFloat(args[0]);
      if (!weight) return reply(`💧 *Usage:* ${prefix}water <weight_kg>\n${prefix}water 70`);
      const liters = (weight * 0.033).toFixed(1);
      const glasses = Math.ceil(liters * 4.23);
      return reply(
        `💧 *Daily Water Intake*\n\n` +
        `Weight: ${weight}kg\n` +
        `Recommended: *${liters} liters/day*\n` +
        `Glasses (240ml): *~${glasses} glasses*\n\n` +
        `_Stay hydrated! 💦_\n\n> ❤️ *AA MD Bot*`
      );
    }

    // ── heart rate zones ───────────────────────────────
    if (['heartrate','hr','maxhr'].includes(command)) {
      const age = parseInt(args[0]);
      if (!age || age < 5 || age > 120) return reply(`❤️ *Usage:* ${prefix}heartrate <age>\n${prefix}heartrate 25`);
      const max = 220 - age;
      return reply(
        `❤️ *Heart Rate Zones — Age ${age}*\n\n` +
        `Max HR: *${max} bpm*\n\n` +
        `🔵 Recovery (50–60%): ${Math.round(max*.5)}–${Math.round(max*.6)} bpm\n` +
        `🟢 Fat Burn (60–70%): ${Math.round(max*.6)}–${Math.round(max*.7)} bpm\n` +
        `🟡 Cardio  (70–80%): ${Math.round(max*.7)}–${Math.round(max*.8)} bpm\n` +
        `🟠 Hard    (80–90%): ${Math.round(max*.8)}–${Math.round(max*.9)} bpm\n` +
        `🔴 Max     (90–100%): ${Math.round(max*.9)}–${max} bpm\n\n` +
        `> ❤️ *AA MD Bot*`
      );
    }

    // ── workout ────────────────────────────────────────
    if (['workout','wod','exercise'].includes(command)) {
      const w = WORKOUTS[Math.floor(Math.random() * WORKOUTS.length)];
      return reply(
        `💪 *Workout: ${w.name}*\n\n` +
        w.list.map((e, i) => `${i+1}. ${e}`).join('\n') +
        `\n\n⏱️ Rest 30s between exercises\n🔄 Complete 3 rounds\n\n> ❤️ *AA MD Bot*`
      );
    }

    // ── stretch ────────────────────────────────────────
    if (command === 'stretch') {
      const stretches = ['Neck rolls (30s each direction)','Shoulder shrugs (10 reps)','Arm crossover stretch (15s each)','Tricep stretch (15s each arm)','Chest opener (30s)','Standing quad stretch (15s each)','Hamstring stretch (15s each)','Calf stretch (15s each)','Hip flexor stretch (15s each)','Child\'s pose (30s)','Cat-cow stretch (10 reps)','Seated twist (15s each side)'];
      return reply(
        `🧘 *Stretching Routine*\n\n` +
        stretches.map((s,i) => `${i+1}. ${s}`).join('\n') +
        `\n\n_Hold gently, don't bounce!_\n\n> ❤️ *AA MD Bot*`
      );
    }

    // ── yoga ───────────────────────────────────────────
    if (['yoga','yogapose'].includes(command)) {
      const p = YOGA_POSES[Math.floor(Math.random() * YOGA_POSES.length)];
      return reply(
        `🧘 *${p.name}*\n\n` +
        `Level: _${p.level}_\n\n` +
        `${p.desc}\n\nHold for 30–60 seconds.\n\n> ❤️ *AA MD Bot*`
      );
    }

    // ── body fat ───────────────────────────────────────
    if (['bodyfat','bfp'].includes(command)) {
      const [waist, neck, height] = [parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2])];
      if (isNaN(waist) || isNaN(neck) || isNaN(height)) return reply(
        `📊 *Body Fat Estimate*\n\n${prefix}bodyfat <waist_cm> <neck_cm> <height_cm>\n${prefix}bodyfat 90 38 175\n\n_Uses the US Navy method._`
      );
      const bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
      const cat = bf < 15 ? 'Athletic 💪' : bf < 20 ? 'Fit 🏃' : bf < 25 ? 'Average 🙂' : bf < 30 ? 'Above average ⚠️' : 'Consider exercise 🏋️';
      return reply(
        `📊 *Body Fat Estimate (US Navy)*\n\n` +
        `Waist: ${waist}cm  Neck: ${neck}cm  Height: ${height}cm\n\n` +
        `Body Fat: *~${bf.toFixed(1)}%*  —  ${cat}\n\n` +
        `_This is an estimate only._\n\n> ❤️ *AA MD Bot*`
      );
    }

    reply(
      `❤️ *Health & Fitness Tools*\n\n` +
      `• ${prefix}bmi <kg> <cm>\n` +
      `• ${prefix}calories <food>\n` +
      `• ${prefix}water <kg>\n` +
      `• ${prefix}heartrate <age>\n` +
      `• ${prefix}workout\n` +
      `• ${prefix}stretch\n` +
      `• ${prefix}yoga\n` +
      `• ${prefix}bodyfat <waist> <neck> <height>\n\n` +
      `> ❤️ *AA MD Bot*`
    );
  },
};
