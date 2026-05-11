const { killPortProcess, PortKillerError } = require("../src/helpers/portKiller");
const childProcess = require("child_process");

// Mock the child_process to simulate behaviors
jest.mock("child_process");

describe("portKiller - killPortProcess", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NODE_ENV = 'development'; // Ensure it's not production
  });

  it("should throw an error with specific message when permission is denied (EPERM)", async () => {
    // Simulate finding a process
    childProcess.exec.mockImplementationOnce((cmd, callback) => {
      // Simulate that findstr / lsof finds a process with PID 1234
      callback(null, "1234", ""); 
    });

    // Simulate permission denied when trying to kill the process
    childProcess.exec.mockImplementationOnce((cmd, callback) => {
      const error = new Error("Command failed: taskkill /PID 1234 /F");
      error.stderr = "ERROR: Access is denied.";
      error.code = 1;
      callback(error, "", error.stderr);
    });

    await expect(killPortProcess(4000)).rejects.toThrow(PortKillerError);
  });

  it("should throw an error with specific message when operation not permitted", async () => {
    // Simulate finding a process
    childProcess.exec.mockImplementationOnce((cmd, callback) => {
      callback(null, "1234", ""); 
    });

    // Simulate permission denied (Linux/Mac style)
    childProcess.exec.mockImplementationOnce((cmd, callback) => {
      const error = new Error("kill: (1234): Operation not permitted");
      error.stderr = "kill: (1234): Operation not permitted";
      error.code = 1;
      callback(error, "", error.stderr);
    });

    await expect(killPortProcess(4000)).rejects.toThrow(PortKillerError);
  });

  it("should return false if no process is found on the port", async () => {
    // Simulate finding NO process
    childProcess.exec.mockImplementationOnce((cmd, callback) => {
      callback(null, "", ""); // empty stdout
    });

    const result = await killPortProcess(4000);
    expect(result).toBe(false);
  });

  it("should handle race condition where process is dead before kill command runs", async () => {
    // Simulate finding a process
    childProcess.exec.mockImplementationOnce((cmd, callback) => {
      callback(null, "1234", ""); 
    });

    // Simulate process already dead (no such process)
    childProcess.exec.mockImplementationOnce((cmd, callback) => {
      const error = new Error("kill: (1234): No such process");
      error.stderr = "kill: (1234): No such process";
      error.code = 1; // commonly exit code 1 when process not found
      callback(error, "", error.stderr);
    });

    const result = await killPortProcess(4000);
    expect(result).toBe(false); // Gracefully handles and returns false
  });
});
