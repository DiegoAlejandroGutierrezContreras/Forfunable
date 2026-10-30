package handlers

import (
	"forfunable/models"
	"forfunable/repository"
)

// attachPostVotes marca en cada post el voto de quien consulta, para que la vista
// resalte su flecha y pueda retirar el voto en lugar de sumar otro.
func attachPostVotes(repo repository.Repository, userID string, posts ...*models.Post) {
	if userID == "" || len(posts) == 0 {
		return
	}
	ids := make([]string, 0, len(posts))
	for _, p := range posts {
		ids = append(ids, p.ID)
	}
	votes, err := repo.GetUserPostVotes(userID, ids)
	if err != nil {
		return
	}
	for _, p := range posts {
		p.UserVote = votes[p.ID]
	}
}

func attachCommentVotes(repo repository.Repository, userID string, comments []*models.Comment) {
	if userID == "" || len(comments) == 0 {
		return
	}
	ids := make([]string, 0, len(comments))
	for _, c := range comments {
		ids = append(ids, c.ID)
	}
	votes, err := repo.GetUserCommentVotes(userID, ids)
	if err != nil {
		return
	}
	for _, c := range comments {
		c.UserVote = votes[c.ID]
	}
}
