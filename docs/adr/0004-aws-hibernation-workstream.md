# ADR 0004: AWS hibernation remains an external workstream

- Status: Accepted for separation; runtime choice pending
- Date: 2026-08-24

## Context

Production KuruBase must stop allocating compute and database capacity after a configurable idle period. The identity refactor does not provide enough evidence to select the final AWS entry point, compute service, or durable PostgreSQL topology.

## Decision

Identity and repository separation may ship without enabling scale-to-zero. Hibernation requires a follow-up ADR that selects the AWS services and demonstrates all of the following before activation:

- a wake path outside the hibernated workload;
- durable PostgreSQL storage and graceful shutdown;
- readiness verification before traffic is routed;
- explicit idle threshold, minimum capacity, and expected cold-start latency;
- health checks, scheduled jobs, tunnel probes, and metrics excluded from qualifying application traffic.

Local development and tests remain always-on by default.

## Consequences

- The identity delivery cannot accidentally claim that an ordinary request can wake stopped compute.
- Scale-to-zero remains a release-blocking infrastructure decision rather than application-process behavior.
