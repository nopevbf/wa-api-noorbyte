/**
 * @jest-environment jsdom
 */

// Mock localStorage
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
    removeItem: jest.fn(key => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; })
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.location
const mockReplace = jest.fn();
const mockLocation = {
  pathname: '/',
  replace: mockReplace,
  href: ''
};
delete window.location;
window.location = mockLocation;

// Import sidebar.js
// We need to bypass the auth guard for tests or mock localStorage before require
localStorage.setItem("noorbyte_session", "test"); 
require('../public/js/sidebar.js');

describe('Jailbreak Session Management', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockLocation.pathname = '/';
  });

  test('clearJailbreakSession should remove jailbreak items from localStorage', () => {
    localStorage.setItem('dparagon_token', 'test_token');
    localStorage.setItem('jailbreak_last_activity', '123456789');
    
    expect(window.clearJailbreakSession).toBeDefined();
    window.clearJailbreakSession();
    
    expect(localStorage.removeItem).toHaveBeenCalledWith('dparagon_token');
    expect(localStorage.removeItem).toHaveBeenCalledWith('jailbreak_last_activity');
    expect(localStorage.getItem('dparagon_token')).toBeNull();
  });

  test('updateJailbreakActivity should update jailbreak_last_activity if main session exists', () => {
    localStorage.setItem('noorbyte_session', 'main_session');
    
    expect(window.updateJailbreakActivity).toBeDefined();
    window.updateJailbreakActivity();
    
    expect(localStorage.setItem).toHaveBeenCalledWith('jailbreak_last_activity', expect.any(String));
    const lastActivity = localStorage.getItem('jailbreak_last_activity');
    expect(lastActivity).not.toBeNull();
  });

  test('updateJailbreakActivity should NOT update activity if main session is missing', () => {
    expect(window.updateJailbreakActivity).toBeDefined();
    window.updateJailbreakActivity();
    
    expect(localStorage.getItem('jailbreak_last_activity')).toBeNull();
  });

  test('isJailbreakSessionValid should return false if main session is missing', () => {
    localStorage.setItem('dparagon_token', 'test_token');
    localStorage.setItem('jailbreak_last_activity', Date.now().toString());
    
    expect(window.isJailbreakSessionValid()).toBe(false);
  });

  test('isJailbreakSessionValid should return false if token is missing', () => {
    localStorage.setItem('noorbyte_session', 'main_session');
    localStorage.setItem('jailbreak_last_activity', Date.now().toString());
    
    expect(window.isJailbreakSessionValid()).toBe(false);
  });

  test('isJailbreakSessionValid should return false if inactive for > 30 minutes', () => {
    localStorage.setItem('noorbyte_session', 'main_session');
    localStorage.setItem('dparagon_token', 'test_token');
    const oldTime = Date.now() - (31 * 60 * 1000);
    localStorage.setItem('jailbreak_last_activity', oldTime.toString());
    
    expect(window.isJailbreakSessionValid()).toBe(false);
  });

  test('isJailbreakSessionValid should return true if all conditions met', () => {
    localStorage.setItem('noorbyte_session', 'main_session');
    localStorage.setItem('dparagon_token', 'test_token');
    localStorage.setItem('jailbreak_last_activity', Date.now().toString());
    
    expect(window.isJailbreakSessionValid()).toBe(true);
  });
});

describe('Jailbreak Session Watcher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    mockReplace.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('startJailbreakSessionWatcher should redirect to login if session expires on jailbreak page', () => {
    mockLocation.pathname = '/jailbreak.html';
    localStorage.setItem('noorbyte_session', 'main_session');
    localStorage.setItem('dparagon_token', 'test_token');
    localStorage.setItem('jailbreak_last_activity', (Date.now() - 31 * 60 * 1000).toString());
    
    expect(window.startJailbreakSessionWatcher).toBeDefined();
    window.startJailbreakSessionWatcher();
    
    jest.advanceTimersByTime(10000);
    
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(localStorage.removeItem).toHaveBeenCalledWith('dparagon_token');
  });
});

describe('Jailbreak Activity Tracking', () => {
  test('initJailbreakActivityTracking should add event listeners that update activity', () => {
    localStorage.setItem('noorbyte_session', 'main_session');
    expect(window.initJailbreakActivityTracking).toBeDefined();
    
    window.initJailbreakActivityTracking();
    
    // Simulate mousedown
    const event = new MouseEvent('mousedown');
    document.dispatchEvent(event);
    
    expect(localStorage.setItem).toHaveBeenCalledWith('jailbreak_last_activity', expect.any(String));
  });
});
