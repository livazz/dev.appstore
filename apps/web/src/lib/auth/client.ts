'use client';
import { createAuthClient } from 'better-auth/react';

/** Client Better Auth côté navigateur (même origine : /api/auth). */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
