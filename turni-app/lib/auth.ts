import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        login: { label: "Username o email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials.password) {
          return null;
        }
        const loginValue = credentials.login.trim();
        const password = credentials.password.trim();

        /**
         * Prima: se sembra un'email, cerca solo per email (univoca).
         * Evita findFirst+OR: due utenti potrebbero far collidere email e name, o l'ordine del DB poteva dare il record sbagliato.
         */
        let user =
          loginValue.includes("@")
            ? await prisma.user.findUnique({
                where: { email: loginValue.toLowerCase() },
              })
            : await prisma.user.findFirst({
                where: { name: { equals: loginValue, mode: "insensitive" } },
              });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
