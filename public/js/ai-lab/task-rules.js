(function (global) {
  function taskHasNavigationTarget(task) {
    if (!task) return false;
    return Number.isFinite(Number(task.lat)) && Number.isFinite(Number(task.lng));
  }

  /** 需到點／限制距離才允許作答（報到型） */
  function taskUsesGps(task) {
    if (!task) return false;
    const gpsEnabled = Boolean(task.location_required || task.task_type === 'location');
    return gpsEnabled && taskHasNavigationTarget(task);
  }

  function getRequiredShots(task) {
    const aiConfig = task?.ai_config && typeof task.ai_config === 'object' ? task.ai_config : {};
    const passCriteria = task?.pass_criteria && typeof task.pass_criteria === 'object' ? task.pass_criteria : {};
    const raw = Number(
      task?.required_shots
      || aiConfig.required_shots
      || passCriteria.required_shots
      || 1
    );
    return Math.max(1, Math.min(3, Number.isFinite(raw) ? raw : 1));
  }

  global.AiLabTaskRules = {
    taskHasNavigationTarget,
    taskUsesGps,
    getRequiredShots
  };
})(window);
