const { getNavbarData } = require('../src/navbar-logic');
describe('Navbar Logic', () => {
    let localStorageMock = {};
    beforeEach(() => {
        localStorageMock = {};
        global.localStorage = {
            getItem: (key) => localStorageMock[key] || null,
            setItem: (key, value) => { localStorageMock[key] = value.toString(); },
            removeItem: (key) => { delete localStorageMock[key]; }
        };
    });
    test('should return Admin when admin is logged in', () => {
        localStorage.setItem('connectApi_loggedIn', 'true');
        const data = getNavbarData('/dashboard');
        expect(data.username).toBe('Admin');
    });
    test('should return noorbyte_username when guest is logged in', () => {
        localStorage.setItem('noorbyte_session', 'guest_token');
        localStorage.setItem('noorbyte_username', 'GuestUser');
        const data = getNavbarData('/dashboard');
        expect(data.username).toBe('GuestUser');
    });
    test('should return correct page name for /dashboard', () => {
        const data = getNavbarData('/dashboard');
        expect(data.pageName).toBe('Dashboard');
    });
});
