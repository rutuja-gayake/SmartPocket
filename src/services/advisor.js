/**
 * SmartPocket Pocket AI Advisor Engine
 *
 * Implements deterministic intent parsing, financial reasoning,
 * and optional server-side Cloud AI integration.
 */

import { rupeesToPaise, paiseToRupees, formatINR } from '../utils/currency.js';
import { calculateAvailableBalance, calculateSafeDailySpending, calculate503020Metrics } from './calculations.js';
import { getRemainingDaysInMonth, getCurrentPeriod } from '../utils/date.js';
import { config } from '../config/index.js';

/**
 * Extracts a numeric rupee amount from user query text.
 * Matches: "₹800", "800 rs", "rs 800", "800 rupees", "₹ 1,500.50", "800"
 * @param {string} text
 * @returns {number|null} amount in rupees
 */
export function extractAmountFromQuery(text) {
  if (!text) return null;
  const match = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:₹|rs\.?|rupees|bucks)?/i);
  if (!match || !match[1]) return null;
  const cleaned = match[1].replace(/,/g, '');
  const num = parseFloat(cleaned);
  return Number.isNaN(num) || num <= 0 ? null : num;
}

/**
 * Deterministic offline rule-based advisor.
 *
 * @param {string} query
 * @param {Object} financialContext
 * @returns {{ answer: string, intent: string, mode: 'offline' }}
 */
export function processOfflineQuery(query, financialContext) {
  const q = query.trim().toLowerCase();
  const {
    availableBalancePaise = 0,
    monthlyBudgetPaise = 0,
    currentMonthExpensePaise = 0,
    categoryBreakdown = [],
    goals = [],
    needsPaise = 0,
    wantsPaise = 0,
    incomePaise = 0
  } = financialContext;

  const remainingDays = getRemainingDaysInMonth();
  const safeDailyInfo = calculateSafeDailySpending({
    availableBalancePaise,
    monthlyBudgetPaise,
    currentMonthExpensePaise,
    currentDate: new Date()
  });

  // 1. Affordability: "Can I afford...", "Can I buy...", "Should I spend..."
  if (q.includes('afford') || q.includes('buy') || (q.includes('spend') && /\d+/.test(q))) {
    const amountRupees = extractAmountFromQuery(q);
    if (!amountRupees) {
      return {
        intent: 'affordability_unclear',
        mode: 'offline',
        answer: 'Could you specify how much that item costs? (e.g. "Can I afford ₹800 shoes?")'
      };
    }

    const itemCostPaise = rupeesToPaise(amountRupees);
    const balanceRupees = paiseToRupees(availableBalancePaise);
    const costRupees = paiseToRupees(itemCostPaise);

    if (itemCostPaise > availableBalancePaise) {
      const shortfall = formatINR(itemCostPaise - availableBalancePaise);
      return {
        intent: 'affordability',
        mode: 'offline',
        answer: `No, this purchase is not currently affordable. You have ${formatINR(availableBalancePaise)} in spendable cash, which falls short by ${shortfall}. Prioritize essential needs until your next allowance.`
      };
    }

    // Balance is enough, but check impact on safe daily spending & monthly budget
    const newBalancePaise = availableBalancePaise - itemCostPaise;
    const newMonthlyExpensePaise = currentMonthExpensePaise + itemCostPaise;
    const remainingBudgetPaise = monthlyBudgetPaise > 0 ? monthlyBudgetPaise - newMonthlyExpensePaise : 0;

    const newSafeDaily = calculateSafeDailySpending({
      availableBalancePaise: newBalancePaise,
      monthlyBudgetPaise,
      currentMonthExpensePaise: newMonthlyExpensePaise,
      currentDate: new Date()
    });

    if (monthlyBudgetPaise > 0 && remainingBudgetPaise < 0) {
      return {
        intent: 'affordability',
        mode: 'offline',
        answer: `You have the cash in hand (${formatINR(availableBalancePaise)}), but buying this for ${formatINR(itemCostPaise)} will overshoot your monthly budget by ${formatINR(Math.abs(remainingBudgetPaise))}. It would also reduce your daily allowance to ${formatINR(newSafeDaily.safeDailyPaise)}/day for the next ${remainingDays} days. Consider waiting or choosing a lower-cost alternative.`
      };
    }

    if (newSafeDaily.safeDailyPaise < (safeDailyInfo.safeDailyPaise * 0.5)) {
      return {
        intent: 'affordability',
        mode: 'offline',
        answer: `Caution: You can physically afford ${formatINR(itemCostPaise)}, but it takes a significant portion of your money. Your safe daily spending would drop from ${formatINR(safeDailyInfo.safeDailyPaise)}/day down to ${formatINR(newSafeDaily.safeDailyPaise)}/day for the remaining ${remainingDays} days of the month.`
      };
    }

    return {
      intent: 'affordability',
      mode: 'offline',
      answer: `Yes, you can comfortably afford ${formatINR(itemCostPaise)}. After this purchase, you will have ${formatINR(newBalancePaise)} left, maintaining a safe daily spending pace of ${formatINR(newSafeDaily.safeDailyPaise)}/day for the next ${remainingDays} days.`
    };
  }

  // 2. Safe daily spending: "How much can I spend today?", "Daily limit"
  if (q.includes('today') || q.includes('daily') || q.includes('limit') || q.includes('safe to spend')) {
    return {
      intent: 'daily_allowance',
      mode: 'offline',
      answer: `Your safe daily spending allowance today is ${formatINR(safeDailyInfo.safeDailyPaise)}. ${safeDailyInfo.message}`
    };
  }

  // 3. Why is budget running low / broke?
  if (q.includes('why') && (q.includes('low') || q.includes('broke') || q.includes('budget') || q.includes('empty'))) {
    const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;
    const wantsPct = incomePaise > 0 ? Math.round((wantsPaise / incomePaise) * 100) : 0;

    let explanation = `Your spendable balance is ${formatINR(availableBalancePaise)}. `;
    if (topCategory) {
      explanation += `Your largest expense this month has been ${topCategory.category_name} (${formatINR(topCategory.total_paise)} across ${topCategory.count} transactions). `;
    }
    if (wantsPct > 30) {
      explanation += `You've spent ${wantsPct}% of your money on discretionary wants (target is 30%). Cutting down on cafes or entertainment will help you balance out.`;
    } else {
      explanation += `Review your recent essential expenses and try to keep your daily spending under ${formatINR(safeDailyInfo.safeDailyPaise)}/day for the next ${remainingDays} days.`;
    }

    return {
      intent: 'budget_analysis',
      mode: 'offline',
      answer: explanation
    };
  }

  // 4. Category-specific queries: "How much on food...", "spent on shopping..."
  for (const cat of categoryBreakdown) {
    const catNameLower = cat.category_name.toLowerCase();
    const keyword = catNameLower.split(' ')[0].replace(/[^a-z]/g, '');
    if (keyword.length > 3 && q.includes(keyword)) {
      return {
        intent: 'category_spending',
        mode: 'offline',
        answer: `You have spent ${formatINR(cat.total_paise)} on ${cat.category_name} across ${cat.count} transaction(s) this month.`
      };
    }
  }

  // 5. 50/30/20 & Wants analysis: "wants", "needs", "50/30/20", "ratio"
  if (q.includes('want') || q.includes('need') || q.includes('50/30/20') || q.includes('ratio')) {
    const metrics = calculate503020Metrics({
      incomePaise,
      needsPaise,
      wantsPaise,
      savingsPaise: 0
    });

    const wantsStatus = metrics.deviations.isWantsOverTarget
      ? `You are currently spending ${metrics.actual.actualWantsPct}% on Wants, which is higher than the recommended 30% guideline.`
      : `Your Wants spending is healthy at ${metrics.actual.actualWantsPct}% (target 30%).`;

    return {
      intent: 'wants_ratio',
      mode: 'offline',
      answer: `${wantsStatus} Breakdown: Needs: ${formatINR(needsPaise)} (${metrics.actual.actualNeedsPct}%), Wants: ${formatINR(wantsPaise)} (${metrics.actual.actualWantsPct}%).`
    };
  }

  // 6. Savings advice / weekly target
  if (q.includes('save') || q.includes('saving') || q.includes('goal')) {
    if (goals.length === 0) {
      return {
        intent: 'savings_advice',
        mode: 'offline',
        answer: 'You have no active savings goals yet. Create a goal (like "Semester Books" or "Emergency Fund") in the Savings tab to get personalized weekly milestones!'
      };
    }

    const activeGoals = goals.filter(g => g.status === 'active');
    let msg = `You have ${activeGoals.length} active savings goal(s). `;
    for (const g of activeGoals.slice(0, 2)) {
      if (g.analysis?.suggestedWeeklyPaise) {
        msg += `For "${g.title}", aim to save ${formatINR(g.analysis.suggestedWeeklyPaise)}/week to reach your target by ${g.target_date}. `;
      }
    }
    return {
      intent: 'savings_advice',
      mode: 'offline',
      answer: msg
    };
  }

  // 7. Highest category: "most", "highest", "where did my money go"
  if (q.includes('most') || q.includes('highest') || q.includes('where')) {
    if (categoryBreakdown.length === 0) {
      return {
        intent: 'top_category',
        mode: 'offline',
        answer: 'No spending recorded yet this month. Once you log transactions, I can show you your highest spending areas.'
      };
    }
    const top = categoryBreakdown[0];
    return {
      intent: 'top_category',
      mode: 'offline',
      answer: `Your highest expense category is ${top.category_name} at ${formatINR(top.total_paise)} (${top.count} transactions).`
    };
  }

  // Fallback helpful guidance
  return {
    intent: 'general_guidance',
    mode: 'offline',
    answer: `Here is your current financial summary: Spendable cash: ${formatINR(availableBalancePaise)}, safe daily spending allowance: ${formatINR(safeDailyInfo.safeDailyPaise)}/day for ${remainingDays} days. You can ask me: "Can I afford ₹500?", "How much have I spent on food?", or "Am I spending too much on wants?"`
  };
}

/**
 * Optional Cloud AI integration (Gemini / OpenAI API).
 * Only called if user has configured AI_PROVIDER and AI_API_KEY.
 * Context is strictly anonymized: no names, emails, or personal transaction notes are sent.
 */
export async function queryCloudAi(prompt, financialSummary) {
  if (config.ai.provider === 'none' || !config.ai.apiKey) {
    throw new Error('Cloud AI provider is not configured. Using offline advisor.');
  }

  const systemInstructions = `
You are the SmartPocket Financial Assistant for college students in India.
Give concise, friendly, practical advice in INR (₹).
Never guarantee financial outcomes. Never invent account balances.
Rely strictly on the provided anonymized financial numbers:
- Spendable Balance: ₹${paiseToRupees(financialSummary.availableBalancePaise).toFixed(2)}
- Safe Daily Spending: ₹${paiseToRupees(financialSummary.safeDailyPaise).toFixed(2)}
- Remaining Days in Month: ${financialSummary.remainingDays}
- Needs Spent: ₹${paiseToRupees(financialSummary.needsPaise).toFixed(2)}
- Wants Spent: ₹${paiseToRupees(financialSummary.wantsPaise).toFixed(2)}
- Remaining Monthly Budget: ₹${paiseToRupees(financialSummary.remainingBudgetPaise).toFixed(2)}
Keep replies under 3-4 sentences.
`;

  if (config.ai.provider === 'groq' || config.ai.provider === 'openai') {
    const endpoint = config.ai.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const defaultModel = config.ai.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';
    const model = config.ai.model || defaultModel;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemInstructions.trim() },
          { role: 'user', content: `Student question: ${prompt.trim()}` }
        ],
        temperature: 0.6,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cloud AI provider (${config.ai.provider}) returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.choices?.[0]?.message?.content;
    if (!candidateText) throw new Error('Empty response from AI provider');

    return candidateText.trim();
  }

  if (config.ai.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.model}:generateContent?key=${config.ai.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemInstructions}\n\nStudent question: ${prompt}` }] }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Cloud AI provider returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) throw new Error('Empty response from AI provider');

    return candidateText.trim();
  }

  throw new Error(`Unsupported AI provider: ${config.ai.provider}`);
}

