describe('Navbar Logic', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.resetModules();
    });
    test('should return Admin when admin is logged in', () => {
        localStorage.setItem('connectApi_loggedIn', 'true');
        const { getNavbarData } = require('../src/navbar-logic');
        const data = getNavbarData('/dashboard');
        expect(data.username).toBe('Admin');
    });
    test('should return noorbyte_username when guest is logged in', () => {
        localStorage.setItem('noorbyte_session', 'guest_token');
        localStorage.setItem('noorbyte_username', 'GuestUser');
        const { getNavbarData } = require('../src/navbar-logic');
        const data = getNavbarData('/dashboard');
        expect(data.username).toBe('GuestUser');
    });
    test('should return correct page name for /dashboard', () => {
        const { getNavbarData } = require('../src/navbar-logic');
        const data = getNavbarData('/dashboard');
        expect(data.pageName).toBe('Dashboard');
    });
});
