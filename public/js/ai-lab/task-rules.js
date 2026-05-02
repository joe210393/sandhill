(function (global) {
  function taskUsesGps(task) {
    if (!task) return false;
    const gpsEnabled = Boolean(task.location_required || task.task_type === 'location');
    const hasCoords = Number.isFinite(Number(task.lat)) && Number.isFinite(Number(task.lng));
    return gpsEnabled && hasCoords;
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
    taskUsesGps,
    getRequiredShots
  };
})(window);
