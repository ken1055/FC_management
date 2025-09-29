// セッション監視ミドルウェア（Vercel最適化）
const fs = require("fs");
const path = require("path");

class SessionMonitor {
  constructor() {
    this.sessionStats = {
      created: 0,
      destroyed: 0,
      errors: 0,
      lastActivity: new Date(),
      activeSessions: new Set(),
    };

    // Vercel環境の検出（複数の方法で確実に検出）
    this.isVercel = 
      process.env.VERCEL === "1" || 
      process.env.VERCEL_ENV || 
      process.env.NOW_REGION || 
      process.cwd().startsWith("/var/task") ||
      process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    // ログファイルパス（Vercel環境では/tmp使用）
    this.logPath = this.isVercel 
      ? path.join("/tmp", "session-monitor.log")
      : path.join(process.cwd(), "session-monitor.log");

    // Vercel環境では定期実行を制限（関数寿命が短いため）
    if (!this.isVercel) {
      setInterval(() => {
        this.logStats();
      }, 5 * 60 * 1000);
    }
  }

  // セッション作成の監視
  onSessionCreate(sessionId, userData) {
    this.sessionStats.created++;
    this.sessionStats.activeSessions.add(sessionId);
    this.sessionStats.lastActivity = new Date();
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'SESSION_CREATE',
      sessionId: sessionId,
      userId: userData?.id,
      userRole: userData?.role,
      userAgent: userData?.userAgent,
      ip: userData?.ip
    };
    
    console.log('🟢 セッション作成:', logEntry);
    this.writeLog(logEntry);
  }

  // セッション破棄の監視
  onSessionDestroy(sessionId, reason = 'unknown') {
    this.sessionStats.destroyed++;
    this.sessionStats.activeSessions.delete(sessionId);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'SESSION_DESTROY',
      sessionId: sessionId,
      reason: reason,
      activeCount: this.sessionStats.activeSessions.size
    };
    
    console.log('🔴 セッション破棄:', logEntry);
    this.writeLog(logEntry);
  }

  // セッションエラーの監視
  onSessionError(sessionId, error, context = {}) {
    this.sessionStats.errors++;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'SESSION_ERROR',
      sessionId: sessionId,
      error: error.message,
      stack: error.stack,
      context: context
    };
    
    console.error('❌ セッションエラー:', logEntry);
    this.writeLog(logEntry);
  }

  // セッション検証の監視
  onSessionValidation(sessionId, isValid, userData) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        event: 'SESSION_VALIDATION',
        sessionId: sessionId,
        isValid: isValid,
        userId: userData?.id,
        userRole: userData?.role
      };
      
      if (!isValid) {
        console.log('⚠️ セッション検証失敗:', logEntry);
        this.writeLog(logEntry);
      }
    } catch (error) {
      // セッション検証エラーでもアプリケーションを停止させない
      console.error('セッション検証ログエラー:', error.message);
    }
  }

  // 統計情報のログ出力
  logStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      event: 'SESSION_STATS',
      stats: {
        ...this.sessionStats,
        activeSessions: this.sessionStats.activeSessions.size,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
    
    console.log('📊 セッション統計:', stats);
    this.writeLog(stats);
  }

  // ログファイルへの書き込み（Vercel最適化）
  writeLog(logEntry) {
    try {
      const logLine = JSON.stringify(logEntry) + "\n";
      
      // 常にコンソールログを出力
      console.log("SESSION_LOG:", logLine.trim());
      
      // ファイル書き込みは安全に実行（エラーが発生しても続行）
      try {
        // 書き込み可能かチェック
        if (!this.isVercel && process.env.NODE_ENV !== "production") {
          fs.appendFileSync(this.logPath, logLine, "utf8");
        }
      } catch (fileError) {
        // ファイル書き込みエラーは無視（コンソールログで十分）
        // console.error("ファイル書き込みスキップ:", fileError.code);
      }
    } catch (error) {
      // 最低限のエラーログ
      console.error("ログ処理エラー:", error.message);
    }
  }

  // Express ミドルウェアとして使用
  middleware() {
    return (req, res, next) => {
      // 緊急時にセッション監視を無効化
      if (process.env.DISABLE_SESSION_MONITOR === "true") {
        return next();
      }

      const originalSessionId = req.sessionID;
      
      // セッション検証
      if (req.session && req.session.user) {
        this.onSessionValidation(originalSessionId, true, {
          id: req.session.user.id,
          role: req.session.user.role
        });
      } else if (req.session) {
        this.onSessionValidation(originalSessionId, false);
      }

      // セッション作成の監視
      if (req.session && req.session.user && !this.sessionStats.activeSessions.has(originalSessionId)) {
        this.onSessionCreate(originalSessionId, {
          id: req.session.user.id,
          role: req.session.user.role,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      }

      // レスポンス終了時の処理
      const originalEnd = res.end;
      res.end = (...args) => {
        // セッション状態の最終チェック
        if (req.session && !req.session.user && this.sessionStats.activeSessions.has(originalSessionId)) {
          this.onSessionDestroy(originalSessionId, 'logout');
        }
        
        originalEnd.apply(res, args);
      };

      next();
    };
  }
}

// シングルトンインスタンス
const sessionMonitor = new SessionMonitor();

module.exports = sessionMonitor;
