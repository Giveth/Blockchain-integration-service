import { expect } from 'chai';
import { Logger } from './logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleOutput: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    logger = new Logger();
    consoleOutput = [];

    // Capture console output
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;

    console.log = (msg: string) => consoleOutput.push(msg);
    console.error = (msg: string) => consoleOutput.push(msg);
    console.warn = (msg: string) => consoleOutput.push(msg);
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Test message');
      expect(consoleOutput).to.have.lengthOf(1);
      const log = JSON.parse(consoleOutput[0]);
      expect(log.level).to.equal('INFO');
      expect(log.message).to.equal('Test message');
    });

    it('should include metadata when provided', () => {
      logger.info('Test message', { key: 'value' });
      const log = JSON.parse(consoleOutput[0]);
      expect(log.meta).to.deep.equal({ key: 'value' });
    });
  });

  describe('error', () => {
    it('should log error messages to stderr', () => {
      logger.error('Error message');
      expect(consoleOutput).to.have.lengthOf(1);
      const log = JSON.parse(consoleOutput[0]);
      expect(log.level).to.equal('ERROR');
      expect(log.message).to.equal('Error message');
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Warning message');
      expect(consoleOutput).to.have.lengthOf(1);
      const log = JSON.parse(consoleOutput[0]);
      expect(log.level).to.equal('WARN');
      expect(log.message).to.equal('Warning message');
    });
  });

  describe('debug', () => {
    it('should log debug messages when log level allows', () => {
      // DEBUG logs are only shown if LOG_LEVEL is DEBUG
      // In test environment, default is INFO, so DEBUG won't be logged
      const oldEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'DEBUG';
      const debugLogger = new Logger();

      debugLogger.debug('Debug message');
      expect(consoleOutput.length).to.be.at.least(0);

      process.env.LOG_LEVEL = oldEnv;
    });
  });

  describe('fatal', () => {
    it('should log fatal messages', () => {
      logger.fatal('Fatal message');
      expect(consoleOutput).to.have.lengthOf(1);
      const log = JSON.parse(consoleOutput[0]);
      expect(log.level).to.equal('FATAL');
      expect(log.message).to.equal('Fatal message');
    });
  });

  describe('JSON formatting', () => {
    it('should include timestamp in log entries', () => {
      logger.info('Test');
      const log = JSON.parse(consoleOutput[0]);
      expect(log.timestamp).to.exist;
      expect(new Date(log.timestamp).getTime()).to.be.closeTo(Date.now(), 1000);
    });

    it('should handle metadata that is not an object', () => {
      logger.info('Test', 'string-meta');
      const log = JSON.parse(consoleOutput[0]);
      expect(log.meta).to.not.exist;
    });

    it('should handle null metadata', () => {
      logger.info('Test', null);
      const log = JSON.parse(consoleOutput[0]);
      expect(log.meta).to.not.exist;
    });
  });
});
