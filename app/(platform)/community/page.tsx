import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createListCommunityPostsUseCase } from "@/src/modules/community/infrastructure/composition/create-list-community-posts-use-case";

const roleLabelByRole: Record<string, string> = {
  "Community Host": "Anfitrion de comunidad",
  "Growth Mentor": "Mentor de crecimiento",
  Host: "Anfitrion",
  Member: "Miembro",
};

export default async function CommunityPage() {
  const listCommunityPostsUseCase = createListCommunityPostsUseCase();
  const posts = await listCommunityPostsUseCase.execute();

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Comunidad
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Las discusiones ya estan modeladas con identidad de miembro e interaccion.
        </h1>
      </header>

      <div className="grid gap-4">
        {posts.map((post) => (
          <Card key={post.id} className="border-border/80 bg-card/88">
            <CardHeader className="gap-4 md:grid md:grid-cols-[auto_1fr]">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{post.author.avatarFallback}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="font-medium">{post.author.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {roleLabelByRole[post.author.role] ?? post.author.role}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <CardTitle>{post.title}</CardTitle>
                <CardDescription>{post.publishedAt}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
              <p>{post.excerpt}</p>
              <p>Respuestas: {post.replyCount}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
