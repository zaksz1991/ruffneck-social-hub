# RuffNeck Social Hub v1.8.0

- Adds Facebook Page image publishing to the existing scheduled publishing worker.
- Requests `pages_manage_posts` during Facebook OAuth.
- Adds a database capability gate requiring the granted permission and Page publishing task.
- Preserves encrypted token storage and workspace role checks.
- Treats uncertain Facebook POST outcomes as needs-review to reduce duplicate posts.
- Updates publishing UI copy to describe Instagram and Facebook support accurately.

Not included: multi-image, video, Reels, albums, other networks or live provider verification.
