const {
  getCurrentBillingMonth,
  calculateBillingAmounts
} = require('./billing');

async function recordLlmUsage(conn, task, userId, usage = {}, meta = {}) {
  if (!conn || !task || !task.quest_chain_id) return;
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const totalTokens = Number(usage.total_tokens || (promptTokens + completionTokens) || 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) return;
  const shopId = Number(task.shop_id || 0) || null;
  const billingMonth = getCurrentBillingMonth();
  await conn.execute(
    `INSERT INTO llm_usage_logs
      (shop_id, quest_chain_id, task_id, user_id, provider, model, request_type, prompt_tokens, completion_tokens, total_tokens, success, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      shopId,
      Number(task.quest_chain_id || 0) || null,
      Number(task.id || 0) || null,
      Number(userId || 0) || null,
      'openai_compatible',
      meta.model || null,
      meta.request_type || task.validation_mode || 'unknown',
      promptTokens,
      completionTokens,
      totalTokens,
      meta.success !== false,
      JSON.stringify(meta || {})
    ]
  );
  await conn.execute(
    `UPDATE quest_chains
        SET lm_total_prompt_tokens = COALESCE(lm_total_prompt_tokens, 0) + ?,
            lm_total_completion_tokens = COALESCE(lm_total_completion_tokens, 0) + ?,
            lm_total_tokens = COALESCE(lm_total_tokens, 0) + ?,
            current_billing_month_tokens = COALESCE(current_billing_month_tokens, 0) + ?
      WHERE id = ?`,
    [promptTokens, completionTokens, totalTokens, totalTokens, task.quest_chain_id]
  );
  if (shopId) {
    await conn.execute(
      `INSERT INTO llm_usage_monthly_summary
        (shop_id, quest_chain_id, billing_month, prompt_tokens, completion_tokens, total_tokens, estimated_amount, donated_amount, is_invoiced)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, FALSE)
       ON DUPLICATE KEY UPDATE
         prompt_tokens = prompt_tokens + VALUES(prompt_tokens),
         completion_tokens = completion_tokens + VALUES(completion_tokens),
         total_tokens = total_tokens + VALUES(total_tokens)`,
      [shopId, Number(task.quest_chain_id || 0) || null, billingMonth, promptTokens, completionTokens, totalTokens]
    );
    const [summaryRows] = await conn.execute(
      `SELECT summary.total_tokens,
              qc.monthly_billing_enabled,
              qc.billing_policy,
              ep.monthly_base_fee,
              ep.token_price_per_1k
       FROM llm_usage_monthly_summary summary
       LEFT JOIN quest_chains qc ON qc.id = summary.quest_chain_id
       LEFT JOIN entry_plans ep ON ep.id = qc.plan_id
       WHERE summary.shop_id = ? AND summary.quest_chain_id = ? AND summary.billing_month = ?
       LIMIT 1`,
      [shopId, Number(task.quest_chain_id || 0) || null, billingMonth]
    );
    const summary = summaryRows[0];
    if (summary) {
      const amounts = calculateBillingAmounts({
        billingPolicy: summary.billing_policy,
        monthlyBaseFee: summary.monthly_base_fee,
        tokenPricePer1k: summary.token_price_per_1k,
        totalTokens: summary.total_tokens,
        monthlyBillingEnabled: summary.monthly_billing_enabled
      });
      await conn.execute(
        `UPDATE llm_usage_monthly_summary
         SET estimated_amount = ?, donated_amount = ?
         WHERE shop_id = ? AND quest_chain_id = ? AND billing_month = ?`,
        [amounts.estimated_amount, amounts.donated_amount, shopId, Number(task.quest_chain_id || 0) || null, billingMonth]
      );
    }
  }
}

async function resolveUserFromRequest(conn, username) {
  const [users] = await conn.execute('SELECT id, role FROM users WHERE username = ?', [username]);
  return users[0] || null;
}

async function getOrCreateUserTask(conn, userId, taskId) {
  const [existing] = await conn.execute(
    'SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ? ORDER BY id DESC LIMIT 1',
    [userId, taskId]
  );

  if (existing.length > 0) return existing[0];

  await conn.execute('INSERT INTO user_tasks (user_id, task_id, status) VALUES (?, ?, "進行中")', [userId, taskId]);
  const [created] = await conn.execute(
    'SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ? ORDER BY id DESC LIMIT 1',
    [userId, taskId]
  );
  return created[0];
}

async function completeUserTask(conn, userTask) {
  let message = '任務完成！';
  let earnedItemName = null;
  let questChainCompleted = false;
  let questChainReward = null;

  await conn.execute('UPDATE user_tasks SET status = "完成", finished_at = NOW() WHERE id = ?', [userTask.id]);

  if (userTask.points > 0) {
    await conn.execute(
      'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userTask.user_id, 'earned', userTask.points, `完成任務: ${userTask.task_name}`, 'task_completion', userTask.task_id]
    );
  }

  const [taskDetails] = await conn.execute(
    'SELECT reward_item_id, i.name as item_name FROM tasks t LEFT JOIN items i ON t.reward_item_id = i.id WHERE t.id = ?',
    [userTask.task_id]
  );
  if (taskDetails.length > 0 && taskDetails[0].reward_item_id) {
    const rewardItemId = taskDetails[0].reward_item_id;
    earnedItemName = taskDetails[0].item_name;
    const [inventory] = await conn.execute(
      'SELECT id FROM user_inventory WHERE user_id = ? AND item_id = ?',
      [userTask.user_id, rewardItemId]
    );
    if (inventory.length > 0) {
      await conn.execute('UPDATE user_inventory SET quantity = quantity + 1 WHERE id = ?', [inventory[0].id]);
    } else {
      await conn.execute('INSERT INTO user_inventory (user_id, item_id, quantity) VALUES (?, ?, 1)', [userTask.user_id, rewardItemId]);
    }
  }

  if (userTask.quest_chain_id && userTask.quest_order) {
    const [userQuests] = await conn.execute(
      'SELECT id, current_step_order FROM user_quests WHERE user_id = ? AND quest_chain_id = ?',
      [userTask.user_id, userTask.quest_chain_id]
    );

    if (userQuests.length > 0) {
      if (userQuests[0].current_step_order === userTask.quest_order) {
        await conn.execute('UPDATE user_quests SET current_step_order = current_step_order + 1 WHERE id = ?', [userQuests[0].id]);
      }
    } else {
      await conn.execute(
        'INSERT INTO user_quests (user_id, quest_chain_id, current_step_order) VALUES (?, ?, ?)',
        [userTask.user_id, userTask.quest_chain_id, userTask.quest_order + 1]
      );
    }

    const [maxOrder] = await conn.execute(
      'SELECT MAX(quest_order) as max_order FROM tasks WHERE quest_chain_id = ?',
      [userTask.quest_chain_id]
    );

    if (maxOrder.length > 0 && maxOrder[0].max_order === userTask.quest_order) {
      questChainCompleted = true;
      const [questChain] = await conn.execute(
        'SELECT chain_points, badge_name, badge_image FROM quest_chains WHERE id = ?',
        [userTask.quest_chain_id]
      );
      if (questChain.length > 0) {
        questChainReward = questChain[0];
        if (questChainReward.chain_points > 0) {
          await conn.execute(
            'INSERT INTO point_transactions (user_id, type, points, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userTask.user_id, 'earned', questChainReward.chain_points, `完成劇情線：${questChainReward.badge_name || '未命名劇情'}`, 'quest_chain_completion', userTask.quest_chain_id]
          );
        }
        await conn.execute(
          'UPDATE user_quests SET is_completed = TRUE, completed_at = NOW() WHERE user_id = ? AND quest_chain_id = ?',
          [userTask.user_id, userTask.quest_chain_id]
        );
      }
    }
  }

  if (earnedItemName) {
    message += ` 並獲得道具：${earnedItemName}！`;
  }

  return { message, earnedItemName, questChainCompleted, questChainReward };
}

module.exports = {
  recordLlmUsage,
  resolveUserFromRequest,
  getOrCreateUserTask,
  completeUserTask
};
