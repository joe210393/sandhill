// task-utils.js - 處理不依賴全域 UI 狀態的純任務邏輯
window.SandhillAiLabTaskUtils = (function() {
  
  function inferTaskCategory(task) {
    if (task?.type === 'timed') return 'timed';
    if (task?.type === 'single') return 'single';
    return 'quest';
  }

  function isAiPhotoTask(task) {
    return task?.task_type === 'photo' && task?.validation_mode?.startsWith('ai_');
  }

  function isKeywordTask(task) {
    return task?.task_type === 'keyword';
  }

  return {
    inferTaskCategory,
    isAiPhotoTask,
    isKeywordTask
  };
})();
