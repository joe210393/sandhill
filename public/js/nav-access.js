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

  const show = el => {
    if (el) el.style.display = '';
  };
  const hide = el => {
    if (el) el.style.display = 'none';
  };

  const showReviewLinks = isVisible => {
    reviewLinks.forEach(link => {
      link.style.display = isVisible ? '' : 'none';
    });
  };

  const showLinks = (links, isVisible) => {
    links.forEach(link => {
      link.style.display = isVisible ? '' : 'none';
    });
  };

  hide(navRoleMgmt);
  hide(navRedeem);
  hide(navAdminUsers);

  if (!loginUser) {
    show(navTasksList);
    hide(navUserTasks);
    hide(navStaff);
    showReviewLinks(false);
    showLinks(navEntryLinks, true);
    showLinks(navShellLinks, true);
    return;
  }

  if (loginUser.role === 'user') {
    show(navTasksList);
    show(navUserTasks);
    hide(navStaff);
    showReviewLinks(false);
    showLinks(navEntryLinks, true);
    showLinks(navShellLinks, true);
  } else if (loginUser.role === 'staff') {
    hide(navTasksList);
    hide(navUserTasks);
    if (navStaff) {
      navStaff.href = '/staff-dashboard.html#review';
      navStaff.textContent = '管理控制台';
      show(navStaff);
    }
    showReviewLinks(false);
    showLinks(navEntryLinks, false);
    showLinks(navShellLinks, false);
  } else {
    hide(navTasksList);
    hide(navUserTasks);
    if (navStaff) {
      navStaff.href = '/staff-dashboard.html';
      navStaff.textContent = '管理控制台';
      show(navStaff);
    }
    showReviewLinks(false);
    showLinks(navEntryLinks, false);
    showLinks(navShellLinks, false);
  }

  // 管理員不在全站 header 提供「探索地圖」「獎勵兌換」入口（營運改由管理控制台）
  if (loginUser && loginUser.role === 'admin') {
    document.querySelectorAll('a[href="/map.html"], a[href="/products.html"]').forEach(hide);
  }
});
