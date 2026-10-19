/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task, Goal, Project, Opportunity, CareerMetrics, ResumeMetrics, BurnoutMetrics, PredictionEngineMetrics } from '../types';

/**
 * Sentinel Nova Client-Side Predictive Calculation Engine
 * Translates and implements the Python ML models directly in TypeScript to support real-time user-context updates.
 */
export class PredictionEngine {
  
  // Model 1 & 2: Task Completion and Delay Risk
  public static calculateTaskPredictions(tasks: Task[], overallCompletionRate?: number): Task[] {
    const priorityWeights: Record<string, number> = { low: 0.1, medium: 0.25, high: 0.45, urgent: 0.65 };
    const difficultyWeights: Record<string, number> = { easy: 0.9, medium: 0.7, hard: 0.4 };

    return tasks.map(task => {
      const isCompleted = task.status === 'completed';
      if (isCompleted) {
        return {
          ...task,
          completionProbability: 100,
          predictedCompletionDate: 'Completed',
          delayRisk: 'low',
          timeAllocationHours: 0,
          predictionSource: 'deterministic_heuristic',
          predictionDataStatus: 'insufficient'
        };
      }

      const pw = priorityWeights[task.priority] || 0.3;
      const dw = difficultyWeights[task.difficulty || 'medium'] || 0.6;
      
      let daysRem = task.daysRemaining;
      if (daysRem === undefined || daysRem === null) {
        if (task.dueDate) {
          const now = new Date();
          const due = new Date(task.dueDate + 'T23:59:59');
          daysRem = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        } else {
          daysRem = 3;
        }
      }

      const estimatedHours = task.estimatedHours !== undefined ? task.estimatedHours : (task.estimatedMinutes || 30) / 60;

      let prob = 0.5;
      let predictedDate = 'In jeopardy';
      let risk: 'low' | 'medium' | 'high' | 'critical' = 'low';

      if (daysRem <= 0) {
        prob = 0;
        predictedDate = 'Overdue';
        risk = 'critical';
      } else {
        const requiredVelocity = estimatedHours / Math.max(1, daysRem);
        // Optimal velocity is around 2-3 hours/day. Higher workloads decrease completion probability
        const velocityPenalty = Math.max(0, requiredVelocity - 4.0) * 0.15;
        const observedCompletionRate = Number.isFinite(overallCompletionRate)
          ? Math.max(0, Math.min(100, overallCompletionRate as number))
          : 50; // neutral baseline; there is no user outcome history to estimate from
        const score = (observedCompletionRate / 100.0) * 0.4 + dw * 0.4 - pw * 0.1 - velocityPenalty;
        
        // Sigmoid activation mapping
        prob = 1.0 / (1.0 + Math.exp(-10 * (score - 0.45)));
        prob = Math.max(0.08, Math.min(0.97, prob));

        // Predict completion date based on velocity
        const expectedDays = Math.ceil(estimatedHours / Math.min(4, Math.max(1, requiredVelocity)));
        predictedDate = `In ${expectedDays} day${expectedDays > 1 ? 's' : ''}`;

        // Classify Risk (Model 2)
        if (prob > 0.82) risk = 'low';
        else if (prob > 0.62) risk = 'medium';
        else if (prob > 0.42) risk = 'high';
        else risk = 'critical';
      }

      return {
        ...task,
        completionProbability: Math.round(prob * 100),
        predictedCompletionDate: predictedDate,
        delayRisk: risk,
        timeAllocationHours: Number((estimatedHours / Math.max(1, daysRem)).toFixed(1)),
        predictionSource: 'deterministic_heuristic',
        predictionDataStatus: 'insufficient'
      };
    });
  }

  // Model 3: Career Readiness Tracker
  public static calculateCareerIntelligence(skills: { name: string; score: number }[], targetSkills: string[] = ["TensorFlow", "PyTorch", "Transformers", "Hyperparameter Search", "Vertex AI", "System Design"]): CareerMetrics {
    if (skills.length === 0) {
      return {
        currentReadiness: 55,
        forecast30Days: 60,
        forecast90Days: 75,
        interviewProbability: 40,
        futureSalaryProjection: [
          { year: 2026, salary: 115000 },
          { year: 2027, salary: 128000 },
          { year: 2028, salary: 145000 }
        ],
        skillGrowth: targetSkills.map(name => ({ name, currentScore: 20, targetScore: 90, predicted90Days: 60 }))
      };
    }

    let matchedSum = 0;
    const skillMap = new Map(skills.map(s => [s.name.toLowerCase(), s.score]));
    
    targetSkills.forEach(ts => {
      const score = skillMap.get(ts.toLowerCase()) || 0;
      matchedSum += (score / 100.0);
    });

    const readinessRatio = matchedSum / targetSkills.length;
    const currentReadiness = Math.round(Math.max(45, Math.min(98, readinessRatio * 100)));
    
    const forecast30Days = Math.min(99, currentReadiness + 5);
    const forecast90Days = Math.min(100, currentReadiness + 14);
    const interviewProbability = Math.round(currentReadiness * 0.92);

    // Dynamic salary curve model based on readiness
    const baseSalary = 100000 + (currentReadiness * 800);
    const futureSalaryProjection = [
      { year: 2026, salary: Math.round(baseSalary) },
      { year: 2027, salary: Math.round(baseSalary * 1.12) },
      { year: 2028, salary: Math.round(baseSalary * 1.25) }
    ];

    const skillGrowth = targetSkills.map(name => {
      const current = skillMap.get(name.toLowerCase()) || 20;
      return {
        name,
        currentScore: current,
        targetScore: 90,
        predicted90Days: Math.min(95, current + 25)
      };
    });

    return {
      currentReadiness,
      forecast30Days,
      forecast90Days,
      interviewProbability,
      futureSalaryProjection,
      skillGrowth
    };
  }

  // Model 4: Resume Evolution Predictor
  public static calculateResumeIntelligence(skillsCount: number, pastScore: number = 72): ResumeMetrics {
    const atsScore = Math.min(98, pastScore + Math.round(skillsCount * 1.8));
    const atsForecast30Days = Math.min(99, atsScore + 4);
    const hiringProbability = Math.round(atsForecast30Days * 0.88);
    const missingSkills = ["Continuous Integration", "Vertex AI Study Jobs", "SCXML Parsing", "Tuning Observability"];

    const improvementTrend = [
      { date: 'May 30', score: 68 },
      { date: 'Jun 10', score: 72 },
      { date: 'Jun 20', score: 76 },
      { date: 'Jun 30', score: atsScore }
    ];

    return {
      atsScore,
      atsForecast30Days,
      missingSkills,
      hiringProbability,
      improvementTrend
    };
  }

  // Model 6: Opportunity Match Optimizer
  public static calculateOpportunityMatch(opportunities: Opportunity[], userSkills: string[]): Opportunity[] {
    const lowercaseSkills = userSkills.map(s => s.toLowerCase());

    return opportunities.map(opp => {
      let matchCount = 0;
      // Simulate mapping keywords
      const oppKeywords: string[] = [];
      if (opp.title.toLowerCase().includes('agent') || opp.title.toLowerCase().includes('ml')) {
        oppKeywords.push('ml', 'tensorflow', 'pytorch', 'transformers');
      }
      if (opp.title.toLowerCase().includes('engineer') || opp.title.toLowerCase().includes('developer')) {
        oppKeywords.push('system design', 'typescript', 'react', 'api');
      }

      oppKeywords.forEach(k => {
        if (lowercaseSkills.some(ls => ls.includes(k) || k.includes(ls))) {
          matchCount++;
        }
      });

      const fitRatio = oppKeywords.length > 0 ? (matchCount / oppKeywords.length) : 0.5;
      const fitScore = Math.max(35, Math.min(98, Math.round(30 + fitRatio * 70)));
      const expectedSuccess = Math.round(fitScore * 0.84);
      const applicationConfidence = Math.round(fitScore * 0.9);
      
      let impact = 50;
      if (opp.type === 'Internship' || opp.type === 'Full-Time') impact = 95;
      else if (opp.type === 'Hackathon') impact = 80;
      else impact = 65;

      let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (opp.deadline.includes('2 days') || opp.deadline.includes('Tomorrow')) urgency = 'critical';
      else if (opp.deadline.includes('5 days') || opp.deadline.includes('week')) urgency = 'high';
      else if (opp.deadline.includes('12 days')) urgency = 'medium';

      return {
        ...opp,
        fitScore,
        expectedSuccess,
        applicationConfidence,
        careerImpactScore: impact,
        deadlineUrgency: urgency
      };
    }).sort((a, b) => b.fitScore - a.fitScore); // Rank opportunities immediately (Model 10)
  }

  // Model 7: Goal Success Predictor
  public static calculateGoalSuccess(goals: Goal[], tasks: Task[]): Goal[] {
    return goals.map(goal => {
      const remainingProgress = 100 - goal.progress;
      if (remainingProgress <= 0) {
        return {
          ...goal,
          successProbability: 100,
          failureProbability: 0,
          predictedMilestoneDelay: false,
          riskLevel: 'low',
          aiRecoveryPlan: ["Goal achieved. Complete post-mortem review."],
          reasoning: "Goal progress is recorded as complete.",
          predictionSource: 'deterministic_heuristic',
          predictionDataStatus: 'sufficient'
        };
      }
      return {
        ...goal,
        successProbability: null,
        failureProbability: null,
        predictedMilestoneDelay: null,
        riskLevel: 'unknown',
        aiRecoveryPlan: [],
        reasoning: 'Goal success probability is unavailable: there is no validated model or historical goal-progress series.',
        predictionSource: 'deterministic_heuristic',
        predictionDataStatus: 'insufficient'
      };
    });
  }

  // Model 8 & 9: Productivity and Burnout Predictor
  public static calculateBurnoutAndProductivity(tasks: Task[]): BurnoutMetrics {
    return {
      burnoutRisk: 'unknown',
      recoverySuggestions: [],
      productivityTrend: [],
      predictionSource: 'deterministic_heuristic',
      predictionDataStatus: 'insufficient'
    };
  }

  // Model 10: Recommendation Ranking Engine
  public static getRankedRecommendations(tasks: Task[], goals: Goal[], career: CareerMetrics): { title: string; category: string; impact: number; priority: string; action: string }[] {
    const recs: { title: string; category: string; impact: number; priority: string; action: string; score: number }[] = [];

    // Derive from pending high priority tasks
    tasks.filter(t => t.status !== 'completed').forEach(t => {
      let score = t.priority === 'urgent' ? 95 : t.priority === 'high' ? 82 : 60;
      recs.push({
        title: `Work on '${t.title}'`,
        category: 'Task Management',
        impact: score,
        priority: t.priority,
        action: `Execute this task to improve goal momentum by ${Math.round(score * 0.15)}%`,
        score: score * 1.1
      });
    });

    // Derive from goals in risk
    goals.filter(g => g.riskLevel === 'high' || g.riskLevel === 'critical').forEach(g => {
      recs.push({
        title: `Recover goal '${g.title}'`,
        category: 'Milestone Shield',
        impact: 94,
        priority: 'critical',
        action: `Review recovery plan: ${g.aiRecoveryPlan?.[1] || 'Optimize timeline'}`,
        score: 110
      });
    });

    // Add general skill recommendation if career readiness is low
    if (career.currentReadiness < 80) {
      recs.push({
        title: "Focus on Fine-Tuning Vertex AI model parameters",
        category: 'Skill Progression',
        impact: 88,
        priority: 'high',
        action: "Gain 15% increase in target DeepMind career compatibility index",
        score: 88
      });
    }

    return recs.sort((a, b) => b.score - a.score).slice(0, 5).map(({ title, category, impact, priority, action }) => ({ title, category, impact, priority, action }));
  }

  // Model Monitoring Metrics
  public static getEngineMetrics(): PredictionEngineMetrics {
    return {
      source: 'deterministic_heuristic',
      validationStatus: 'not_evaluated'
    };
  }
}
