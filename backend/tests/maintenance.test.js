const fs = require('fs');
const path = require('path');

describe('Maintenance Mode & Jailbreak Redirection Test Suite (ISTQB)', () => {
  const publicDir = path.join(__dirname, '../../frontend/public');
  const sidebarHtmlPath = path.join(publicDir, 'components/sidebar.html');
  const sidebarJsPath = path.join(publicDir, 'js/sidebar.js');
  const loginJsPath = path.join(publicDir, 'js/login.js');

  const maintenancePages = [
    'dashboard.html',
    'devices.html',
    'groups.html',
    'tester.html',
    'auto-reply.html',
    'automation.html',
    'pulse.html'
  ];

  describe('1. Sidebar Navigation Markings (TC-MAINT-001 & TC-MAINT-002)', () => {
    test('should mark all 6 target modules with data-maintenance="true" in sidebar.html', () => {
      const html = fs.readFileSync(sidebarHtmlPath, 'utf8');
      document.body.innerHTML = html;

      const dashboardLink = document.querySelector('a[href="/dashboard"]');
      const devicesLink = document.querySelector('a[href="/devices"]');
      const groupsLink = document.querySelector('a[href="/groups"]');
      const sendMessagesBtn = document.querySelector('#btn-send-messages');
      const testerLink = document.querySelector('a[href="/tester"]');
      const autoReplyLink = document.querySelector('a[href="/auto-reply"]');
      const automationLink = document.querySelector('a[href="/automation"]');
      const pulseLink = document.querySelector('a[href="/pulse"]');
      const jailbreakLink = document.querySelector('#navJailbreak');

      // Target modules must be marked for maintenance
      expect(dashboardLink.getAttribute('data-maintenance')).toBe('true');
      expect(devicesLink.getAttribute('data-maintenance')).toBe('true');
      expect(groupsLink.getAttribute('data-maintenance')).toBe('true');
      expect(sendMessagesBtn.getAttribute('data-maintenance')).toBe('true');
      expect(testerLink.getAttribute('data-maintenance')).toBe('true');
      expect(autoReplyLink.getAttribute('data-maintenance')).toBe('true');
      expect(automationLink.getAttribute('data-maintenance')).toBe('true');
      expect(pulseLink.getAttribute('data-maintenance')).toBe('true');

      // Jailbreak menu must NOT be marked for maintenance
      expect(jailbreakLink.getAttribute('data-maintenance')).toBeNull();
    });
  });

  describe('2. Page Body Commented Out (TC-MAINT-003)', () => {
    maintenancePages.forEach((pageName) => {
      test(`should comment out main interactive content in ${pageName}`, () => {
        const filePath = path.join(publicDir, pageName);
        const content = fs.readFileSync(filePath, 'utf8');

        // Verify that maintenance comment banner exists
        expect(content).toMatch(/<!--\s*MAINTENANCE:/i);

        // Verify that sidebar-container and script tags are still retained
        expect(content).toContain('id="sidebar-container"');
        expect(content).toContain('/js/sidebar.js');
      });
    });
  });

  describe('3. Login Redirection to Jailbreak (TC-MAINT-007)', () => {
    test('should redirect authenticated users to /jailbreak instead of /dashboard in login.js', () => {
      const content = fs.readFileSync(loginJsPath, 'utf8');

      // Auth guard redirect
      expect(content).toContain('window.location.replace("/jailbreak")');
      expect(content).not.toContain('window.location.replace("/dashboard")');

      // Admin login redirect
      expect(content).toContain('window.location.href = "/jailbreak"');
      expect(content).not.toContain('window.location.href = "/dashboard"');
    });
  });

  describe('4. Maintenance Modal & Interception Logic in sidebar.js (TC-MAINT-004, 005, 006)', () => {
    test('should implement showMaintenanceModal and intercept maintenance elements', () => {
      const content = fs.readFileSync(sidebarJsPath, 'utf8');

      // Function definition
      expect(content).toContain('function showMaintenanceModal(');

      // Countdown logic
      expect(content).toContain('maintenanceCountdown');
      expect(content).toContain('setInterval(');

      // Redirection target
      expect(content).toContain('/jailbreak');

      // Direct URL check
      expect(content).toMatch(/maintenancePages|maintenanceRoutes/);
    });
  });
});
