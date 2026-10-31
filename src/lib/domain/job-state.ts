export const JOB_STATES=['queued','claimed','dispatching','succeeded','retryable','failed','needs_review','cancelled'] as const;
export type JobState=typeof JOB_STATES[number];
const transitions:Record<JobState,readonly JobState[]>={queued:['claimed','cancelled'],claimed:['dispatching','retryable','failed','needs_review'],dispatching:['succeeded','retryable','failed','needs_review'],succeeded:[],retryable:['claimed','cancelled'],failed:[],needs_review:['claimed','cancelled'],cancelled:[]};
export const canTransition=(from:JobState,to:JobState)=>transitions[from].includes(to);
export function assertTransition(from:JobState,to:JobState){if(!canTransition(from,to))throw new Error(`Invalid job transition ${from} -> ${to}`)}
