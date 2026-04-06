document.addEventListener('DOMContentLoaded', () => {
  let loginUser = window.loginUser;
  if (!loginUser) {
    try {
      loginUser = JSON.parse(localStorage.getItem('loginUser') || 'null');
      if (loginUser) {
        window.loginUser = loginUser;
      }
    } catch (err) {
      loginUser = null;
    }
  }

  const navTasksList = document.getElementById('navTasksList');
  const navUserTasks = document.getElementById('navUserTasks');
  const navStaff = document.getElementById('navStaff');
  const navRoleMgmt = document.getElementById('navRoleMgmt');
  const navRedeem = document.getElementById('navRedeem');
  const navAdminUsers = document.getElementById('navAdminUsers');
  const reviewLinks = document.querySelectorAll('a[href="/user-tasks.html"]');
  const navEntryLinks = document.querySelectorAll('a[href="/index.html#gameEntries"]');
  const navShellLinks = document.querySelectorAll('a[href="/ai-lab.html"]');

  const show = el => { if (el) el.style.display = ''; };
  const hide = el => { if (el) el.style.display = 'none'; };

  const showReviewLinks = isVisible => {
    reviewLinks.forEach(link => {
      if (isVisible) {
        link.style.display = '';
      } else {
        link.style.display = 'none';
      }
    });
  };

  const showLinks = (links, isVisible) => {
    links.forEach(link => {
      link.style.display = isVisible ? '' : 'none';
    });
  };

  if (!loginUser) {
    // 未登入：保留首頁入口與遊戲殼入口，不顯示管理導向
    show(navTasksList);
    hide(navUserTasks);
    hide(navStaff);
    hide(navRoleMgmt);
    hide(navRedeem);
    hide(navAdminUsers);
    showReviewLinks(false);
    showLinks(navEntryLinks, true);
    showLinks(navShellLinks, true);
    return;
  }

  if (loginUser.role === 'user') {
    show(navTasksList);
    show(navUserTasks);
    hide(navStaff);
    hide(navRoleMgmt);
    hide(navRedeem);
    hide(navAdminUsers);
    showReviewLinks(false);
    showLinks(navEntryLinks, true);
    showLinks(navShellLinks, true);
  } else if (loginUser.role === 'staff') {
    // staff：只保留遊戲紀錄與審核入口，不走玩家玩法入口
    hide(navTasksList);
    hide(navUserTasks);
    hide(navStaff);
    hide(navRoleMgmt);
    hide(navRedeem);
    hide(navAdminUsers);
    showReviewLinks(true);
    showLinks(navEntryLinks, false);
    showLinks(navShellLinks, false);
  } else {
    hide(navTasksList);
    hide(navUserTasks);
    show(navStaff);
    show(navRoleMgmt);
    show(navRedeem);
    // 僅 admin 顯示會員管理
    if (loginUser.role === 'admin') {
      show(navAdminUsers);
    } else {
      hide(navAdminUsers);
    }
    showReviewLinks(true);
    showLinks(navEntryLinks, false);
    showLinks(navShellLinks, false);
  }
});
