(function (global) {
  function normalizeBoolean(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return false;
  }

  function taskGpsEnabled(task) {
    if (!task) return false;
    return normalizeBoolean(task.location_required) || task.task_type === 'location';
  }

  function taskHasNavigationTarget(task) {
    if (!task) return false;
    const lat = Number(task.lat);
    const lng = Number(task.lng);
    return taskGpsEnabled(task)
      && Number.isFinite(lat)
      && Number.isFinite(lng)
      && !(lat === 0 && lng === 0);
  }

  /** 需到點／限制距離才允許作答（報到型） */
  function taskUsesGps(task) {
    return taskHasNavigationTarget(task);
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
    taskGpsEnabled,
    taskHasNavigationTarget,
    taskUsesGps,
    getRequiredShots
  };
})(window);
