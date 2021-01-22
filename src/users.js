const fs = require('fs');

class UsersTracker{

    constructor(usersFile){
        this.usersFile = usersFile;

        if (!fs.existsSync(this.usersFile)){
            fs.writeFileSync(this.usersFile, JSON.stringify([]), 'utf8');
        }

        this.currentUsers = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
    }

    addUser(id){
        if(!this.currentUsers.includes(id)){
            this.currentUsers.push(id);
            fs.writeFile(this.usersFile, JSON.stringify(this.currentUsers), 'utf8', err => {
                if(err){
                    console.log(`[UsersTracker] Error: ${err}`)
                }
            });
            return true;
        }

        return false;
    }
    
    listUsers(){
        return this.currentUsers;
    }
    
    removeUser(id){
        const index = this.currentUsers.indexOf(id);
        if (index > -1) {
            array.splice(index, 1);
        }
    }
}

module.exports.UsersTracker = UsersTracker;